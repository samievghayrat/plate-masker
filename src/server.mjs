import 'dotenv/config';
import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import archiver from 'archiver';
import { processUrl } from './pipeline.mjs';
import { detectPlates } from './detect.mjs';
import { applyOverlays, applyWatermark } from './overlay.mjs';
import { isValidUrl } from './utils.mjs';
import { OUTPUT_DIR, MODEL_PATH } from './config.mjs';
import axios from 'axios';
import { generateCarPost } from './encar.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const MODEL_URL = 'https://huggingface.co/morsetechlab/yolov11-license-plate-detection/resolve/main/license-plate-finetune-v1n.onnx';

async function ensureModel() {
  if (fs.existsSync(MODEL_PATH)) return;
  console.log('[server] Model not found, downloading...');
  const modelDir = path.dirname(MODEL_PATH);
  if (!fs.existsSync(modelDir)) fs.mkdirSync(modelDir, { recursive: true });
  for (let i = 1; i <= 3; i++) {
    try {
      const resp = await axios.get(MODEL_URL, { responseType: 'arraybuffer', timeout: 120000 });
      fs.writeFileSync(MODEL_PATH, Buffer.from(resp.data));
      console.log(`[server] Model downloaded (${(resp.data.byteLength / 1e6).toFixed(1)} MB)`);
      return;
    } catch (err) {
      console.error(`[server] Model download attempt ${i} failed: ${err.message}`);
      if (i < 3) await new Promise((r) => setTimeout(r, 5000));
    }
  }
  console.error('[server] WARNING: Model download failed. Plate detection will not work.');
}
const app = express();
const PORT = process.env.PORT || 3100;

app.use(express.json({ limit: '6mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Serve the frontend
app.get('/', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});
app.get('/styles.css', (_req, res) => {
  res.type('text/css').sendFile(path.join(__dirname, 'public', 'styles.css'));
});
app.get('/app.js', (_req, res) => {
  res.type('application/javascript').sendFile(path.join(__dirname, 'public', 'app.js'));
});
app.get('/zip.js', (_req, res) => {
  res.type('application/javascript').sendFile(path.join(__dirname, 'public', 'zip.js'));
});

// Async job queue for processing
const jobs = new Map();
let jobCounter = 0;

// Start processing a URL (returns immediately with job ID)
app.post('/api/process', async (req, res) => {
  const {
    url,
    watermark,
    maskPlates = true,
    generateText = true,
  } = req.body;

  if (!url || !isValidUrl(url)) {
    return res.status(400).json({ error: 'Invalid URL. Please provide a valid HTTP/HTTPS URL.' });
  }

  const jobId = String(++jobCounter);
  jobs.set(jobId, {
    status: 'processing',
    url,
    progress: { stage: 'starting', current: 0, total: 1, message: 'Starting' },
  });

  console.log(`[server] Job ${jobId} started: ${url}`);
  const runJob = processUrl(url, {
    watermark,
    maskPlates: Boolean(maskPlates),
    onProgress: (progress) => {
      const job = jobs.get(jobId);
      if (job?.status === 'processing') jobs.set(jobId, { ...job, progress });
    },
  }).then(({ images, car }) => {
    const response = images.map((r) => ({
      filename: r.filename,
      sourceUrl: r.sourceUrl,
      platesFound: r.platesFound,
      maskRequested: r.maskRequested,
      dataUrl: `data:image/jpeg;base64,${r.buffer.toString('base64')}`,
    }));
    const publicCar = car ? { ...car } : null;
    if (publicCar) delete publicCar.imageUrls;
    jobs.set(jobId, {
      status: 'done',
      results: response,
      car: publicCar,
      postText: generateText && publicCar
        ? generateCarPost(publicCar, { includeVin: false, priceMode: 'korea' })
        : '',
      progress: { stage: 'done', current: response.length, total: response.length, message: 'Ready to post' },
    });
    console.log(`[server] Job ${jobId} done — ${images.length} image(s) processed`);
    return jobs.get(jobId);
  }).catch((err) => {
    jobs.set(jobId, { status: 'error', error: err.message });
    console.error(`[server] Job ${jobId} error: ${err.message}`);
    return jobs.get(jobId);
  });

  // A Vercel Function cannot depend on a later polling request reaching the
  // same warm instance, so finish the personal-use job in this request.
  if (process.env.VERCEL) {
    const completedJob = await runJob;
    return res.status(completedJob.status === 'error' ? 500 : 200).json({ jobId, ...completedJob });
  }

  res.json({ jobId });
});

// Poll job status
app.get('/api/jobs/:id', (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job) return res.status(404).json({ error: 'Job not found' });
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.json(job);
});

// Rebuild the editable Russian post with the selected price/privacy settings.
app.post('/api/jobs/:id/generate-text', (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job || job.status !== 'done' || !job.car) {
    return res.status(404).json({ error: 'Car details are not available for this job' });
  }

  const priceMode = req.body?.priceMode === 'turnkey' ? 'turnkey' : 'korea';
  const postText = generateCarPost(job.car, {
    includeVin: req.body?.includeVin === true,
    priceMode,
    turnkeyPrice: req.body?.turnkeyPrice,
  });
  res.json({ postText });
});

// Stateless text generation for serverless deployments where an in-memory job
// may not be present on a later request.
app.post('/api/generate-text', (req, res) => {
  if (!req.body?.car || typeof req.body.car !== 'object') {
    return res.status(400).json({ error: 'Car details are required' });
  }
  const priceMode = req.body.priceMode === 'turnkey' ? 'turnkey' : 'korea';
  res.json({
    postText: generateCarPost(req.body.car, {
      includeVin: req.body.includeVin === true,
      priceMode,
      turnkeyPrice: req.body.turnkeyPrice,
    }),
  });
});

function isAllowedListingImage(value) {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:' && (
      parsed.hostname === 'ci.encar.com'
      || parsed.hostname === 'img.kbchachacha.com'
    );
  } catch {
    return false;
  }
}

// Stateless single-image processing. The source URL comes from structured
// Encar/KB listing data and is restricted to their image CDNs.
app.post('/api/process-image', async (req, res) => {
  const { sourceUrl, rectangles, watermark } = req.body || {};
  if (!isAllowedListingImage(sourceUrl)) {
    return res.status(400).json({ error: 'Unsupported image source' });
  }

  try {
    const imageResponse = await axios.get(sourceUrl, {
      responseType: 'arraybuffer',
      timeout: 30000,
      maxRedirects: 3,
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
    });
    const buffer = Buffer.from(imageResponse.data);
    let plates;
    if (Array.isArray(rectangles) && rectangles.length) {
      plates = rectangles.map((rectangle) => ({
        x0: Number(rectangle.x0) || 0,
        y0: Number(rectangle.y0) || 0,
        x1: Number(rectangle.x1) || 0,
        y1: Number(rectangle.y1) || 0,
        angle: 0,
      }));
    } else {
      ({ plates } = await detectPlates(buffer));
    }
    let processed = plates.length ? await applyOverlays(buffer, plates) : buffer;
    processed = await applyWatermark(processed, watermark);
    res.json({
      platesFound: plates.length,
      dataUrl: `data:image/jpeg;base64,${processed.toString('base64')}`,
    });
  } catch (error) {
    console.error(`[server] Stateless image processing error: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

// Serve processed images from output directory
app.get('/api/images/:filename', (req, res) => {
  const filename = path.basename(req.params.filename); // prevent path traversal
  const filePath = path.join(OUTPUT_DIR, filename);

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'Image not found' });
  }

  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.type('image/jpeg').sendFile(path.resolve(filePath));
});

// Download a processed image (forces browser save)
app.get('/api/download/:filename', (req, res) => {
  const filename = path.basename(req.params.filename);
  const filePath = path.join(OUTPUT_DIR, filename);

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'Image not found' });
  }

  res.download(path.resolve(filePath), filename);
});

// Delete a processed image
app.delete('/api/images/:filename', (req, res) => {
  const filename = path.basename(req.params.filename); // prevent path traversal
  const filePath = path.join(OUTPUT_DIR, filename);

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'Image not found' });
  }

  fs.unlinkSync(filePath);
  // Also delete the original file if it exists
  const originalFilename = filename.replace(/\.jpg$/, '_original.jpg');
  const originalPath = path.join(OUTPUT_DIR, originalFilename);
  if (fs.existsSync(originalPath)) {
    fs.unlinkSync(originalPath);
    console.log(`[server] Deleted original: ${originalFilename}`);
  }
  console.log(`[server] Deleted: ${filename}`);
  res.json({ deleted: filename });
});

// Manual overlay: draw white rectangles on the original image
app.post('/api/manual-overlay', async (req, res) => {
  const { filename, rectangles, watermark } = req.body;

  if (!filename || !Array.isArray(rectangles) || rectangles.length === 0) {
    return res.status(400).json({ error: 'filename and non-empty rectangles array required' });
  }

  const safeName = path.basename(filename);
  const originalFilename = safeName.replace(/\.jpg$/, '_original.jpg');
  const originalPath = path.join(OUTPUT_DIR, originalFilename);
  const processedPath = path.join(OUTPUT_DIR, safeName);

  // Load original (fall back to processed for legacy images)
  let sourcePath = originalPath;
  if (!fs.existsSync(originalPath)) {
    if (!fs.existsSync(processedPath)) {
      return res.status(404).json({ error: 'Image not found' });
    }
    sourcePath = processedPath;
  }

  try {
    const buffer = fs.readFileSync(sourcePath);
    const plates = rectangles.map((r) => ({ x0: r.x0, y0: r.y0, x1: r.x1, y1: r.y1, angle: 0 }));
    let result = await applyOverlays(buffer, plates);
    result = await applyWatermark(result, watermark);
    fs.writeFileSync(processedPath, result);
    console.log(`[server] Manual overlay applied to ${safeName} (${rectangles.length} rect(s))`);
    res.json({ filename: safeName, rectsApplied: rectangles.length });
  } catch (err) {
    console.error(`[server] Manual overlay error: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

// Reprocess a single image: re-detect plates on the original and re-apply overlays
app.post('/api/reprocess/:filename', async (req, res) => {
  const { watermark } = req.body || {};
  const safeName = path.basename(req.params.filename);
  const originalFilename = safeName.replace(/\.jpg$/, '_original.jpg');
  const originalPath = path.join(OUTPUT_DIR, originalFilename);
  const processedPath = path.join(OUTPUT_DIR, safeName);

  if (!fs.existsSync(originalPath)) {
    return res.status(400).json({ error: 'Original image not available. Cannot reprocess.' });
  }

  try {
    const buffer = fs.readFileSync(originalPath);
    const { plates } = await detectPlates(buffer);

    let outputBuffer;
    if (plates.length === 0) {
      outputBuffer = buffer;
    } else {
      outputBuffer = await applyOverlays(buffer, plates);
    }
    outputBuffer = await applyWatermark(outputBuffer, watermark);

    fs.writeFileSync(processedPath, outputBuffer);
    console.log(`[server] Reprocessed ${safeName}: ${plates.length} plate(s) found`);
    res.json({ filename: safeName, platesFound: plates.length });
  } catch (err) {
    console.error(`[server] Reprocess error: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

// Download selected processed images as a zip
app.post('/api/download-all', (req, res) => {
  const { filenames } = req.body;
  const outputPath = path.resolve(OUTPUT_DIR);

  if (!fs.existsSync(outputPath)) {
    return res.status(404).json({ error: 'No output directory found' });
  }

  // If filenames provided, only include those; otherwise fall back to all non-original images
  let files;
  if (Array.isArray(filenames) && filenames.length > 0) {
    files = filenames
      .map((f) => path.basename(f))
      .filter((f) => fs.existsSync(path.join(outputPath, f)));
  } else {
    files = fs.readdirSync(outputPath).filter((f) =>
      /\.(jpg|jpeg|png|webp)$/i.test(f) && !/_original\./i.test(f)
    );
  }

  if (files.length === 0) {
    return res.status(404).json({ error: 'No images to download' });
  }

  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', 'attachment; filename="plate-masker-output.zip"');

  const archive = archiver('zip', { zlib: { level: 5 } });
  archive.on('error', (err) => res.status(500).json({ error: err.message }));
  archive.pipe(res);

  for (const file of files) {
    archive.file(path.join(outputPath, file), { name: file });
  }

  archive.finalize();
});

export default app;

if (!process.env.VERCEL) ensureModel().then(() => {
  app.listen(PORT, () => {
    console.log(`[server] Plate Masker web UI running at http://localhost:${PORT}`);
  });
});
