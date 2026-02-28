import fs from 'fs';
import path from 'path';
import { acquireImages } from './acquire.mjs';
import { detectPlates, terminateWorker } from './detect.mjs';
import { applyOverlays } from './overlay.mjs';
import { ensureJpegExtension } from './utils.mjs';
import { OUTPUT_DIR } from './config.mjs';

export async function processUrl(url, options = {}) {
  const outputDir = options.output || OUTPUT_DIR;

  // Ensure output directory exists
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
    console.log(`[pipeline] Created output directory: ${outputDir}`);
  }

  // Step 1: Acquire images
  console.log('\n=== Step 1: Acquiring images ===');
  const images = await acquireImages(url);
  console.log(`[pipeline] Acquired ${images.length} image(s)\n`);

  const results = [];

  for (let i = 0; i < images.length; i++) {
    const { buffer, filename } = images[i];
    console.log(`\n=== Processing image ${i + 1}/${images.length}: ${filename} ===`);

    // Step 2: Detect plates
    console.log('--- Step 2: Detecting plates ---');
    const { plates } = await detectPlates(buffer);

    // Step 3: Apply overlay
    let outputBuffer;
    let outputFilename = ensureJpegExtension(filename);
    // Avoid filename collisions
    if (results.some((r) => r.filename === outputFilename)) {
      const base = outputFilename.replace(/\.jpg$/, '');
      outputFilename = `${base}_${i}.jpg`;
    }
    const outputPath = path.join(outputDir, outputFilename);

    if (plates.length === 0) {
      console.warn(`[pipeline] WARNING: No plates detected in ${filename}. Saving original.`);
      outputBuffer = buffer;
    } else {
      console.log(`--- Step 3: Applying overlay to ${plates.length} plate(s) ---`);
      outputBuffer = await applyOverlays(buffer, plates, {
        text: options.text,
        color: options.color,
      });
    }

    // Step 4: Save
    fs.writeFileSync(outputPath, outputBuffer);
    console.log(`[pipeline] Saved: ${outputPath}`);

    results.push({
      filename: outputFilename,
      path: outputPath,
      platesFound: plates.length,
    });
  }

  // Cleanup
  await terminateWorker();

  return results;
}
