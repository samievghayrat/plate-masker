import fs from 'fs';
import path from 'path';
import { acquireImages } from './acquire.mjs';
import { detectPlates, terminateWorker } from './detect.mjs';
import { applyOverlays, applyWatermark } from './overlay.mjs';
import { ensureJpegExtension } from './utils.mjs';
import { OUTPUT_DIR } from './config.mjs';
import { fetchEncarListing } from './encar.mjs';
import { fetchKbListing } from './kbcar.mjs';

export async function processUrl(url, options = {}) {
  const outputDir = options.output || OUTPUT_DIR;
  const shouldMask = options.maskPlates !== false;
  const onProgress = typeof options.onProgress === 'function' ? options.onProgress : () => {};

  // Ensure output directory exists
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
    console.log(`[pipeline] Created output directory: ${outputDir}`);
  }

  // Step 1: Acquire images
  console.log('\n=== Step 1: Acquiring images ===');
  const isEncar = /encar\.com/i.test(url);
  const isKbChachacha = /kbchachacha\.com/i.test(url);
  const sourceName = isKbChachacha ? 'KB Chachacha' : isEncar ? 'Encar' : 'the listing';
  onProgress({ stage: 'details', current: 0, total: 1, message: `Reading ${sourceName} car details` });
  let car = null;
  if (isEncar) {
    car = await fetchEncarListing(url);
  } else if (isKbChachacha) {
    car = await fetchKbListing(url);
  }
  const images = await acquireImages(url, {
    ...options,
    listing: car,
    onProgress,
  });
  console.log(`[pipeline] Acquired ${images.length} image(s)\n`);

  const results = [];

  try {
    for (let i = 0; i < images.length; i++) {
      const { buffer, filename } = images[i];
      console.log(`\n=== Processing image ${i + 1}/${images.length}: ${filename} ===`);
      onProgress({
        stage: shouldMask ? 'mask' : 'prepare',
        current: i + 1,
        total: images.length,
        message: shouldMask
          ? `Masking plates ${i + 1}/${images.length}`
          : `Preparing photos ${i + 1}/${images.length}`,
      });

      let plates = [];
      if (shouldMask) {
        console.log('--- Step 2: Detecting plates ---');
        ({ plates } = await detectPlates(buffer));
      }

      let outputBuffer;
      let outputFilename = ensureJpegExtension(filename);
      if (results.some((result) => result.filename === outputFilename)) {
        const base = outputFilename.replace(/\.jpg$/, '');
        outputFilename = `${base}_${i}.jpg`;
      }
      const outputPath = path.join(outputDir, outputFilename);

      // Keep the untouched source for manual correction and future reprocessing.
      const originalFilename = outputFilename.replace(/\.jpg$/, '_original.jpg');
      const originalPath = path.join(outputDir, originalFilename);
      fs.writeFileSync(originalPath, buffer);

      if (plates.length === 0) {
        if (shouldMask) console.warn(`[pipeline] WARNING: No plates detected in ${filename}.`);
        outputBuffer = buffer;
      } else {
        console.log(`--- Step 3: Applying overlay to ${plates.length} plate(s) ---`);
        outputBuffer = await applyOverlays(buffer, plates, { color: options.color });
      }

      outputBuffer = await applyWatermark(outputBuffer, options.watermark);
      fs.writeFileSync(outputPath, outputBuffer);
      console.log(`[pipeline] Saved: ${outputPath}`);

      results.push({
        filename: outputFilename,
        sourceUrl: images[i].sourceUrl || '',
        path: outputPath,
        platesFound: plates.length,
        maskRequested: shouldMask,
        buffer: outputBuffer,
      });
    }
  } finally {
    if (shouldMask) await terminateWorker();
  }

  onProgress({ stage: 'done', current: images.length, total: images.length, message: 'Ready to post' });
  return { images: results, car };
}
