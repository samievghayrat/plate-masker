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
import { OUTPUT_DIR } from './config.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// Serve the frontend
app.get('/', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Process a URL
app.post('/api/process', async (req, res) => {
  const { url } = req.body;

  if (!url || !isValidUrl(url)) {
    return res.status(400).json({ error: 'Invalid URL. Please provide a valid HTTP/HTTPS URL.' });
  }

  try {
    console.log(`[server] Processing: ${url}`);
    const results = await processUrl(url);

    const response = results.map((r) => ({
      filename: r.filename,
      platesFound: r.platesFound,
    }));

    console.log(`[server] Done — ${results.length} image(s) processed`);
    res.json(response);
  } catch (err) {
    console.error(`[server] Error: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

// Serve processed images from output directory
app.get('/api/images/:filename', (req, res) => {
  const filename = path.basename(req.params.filename); // prevent path traversal
  const filePath = path.join(OUTPUT_DIR, filename);

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'Image not found' });
  }

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
  const { filename, rectangles } = req.body;

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
    result = await applyWatermark(result);
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
    outputBuffer = await applyWatermark(outputBuffer);

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

app.listen(PORT, () => {
  console.log(`[server] Plate Masker web UI running at http://localhost:${PORT}`);
});
