#!/usr/bin/env node

import { Command } from 'commander';
import { processUrl } from './pipeline.mjs';
import { isValidUrl } from './utils.mjs';
import { OVERLAY_TEXT, OVERLAY_BG_COLOR, OUTPUT_DIR } from './config.mjs';

const program = new Command();

program
  .name('plate-masker')
  .description('Detect and mask license plates in car images')
  .version('1.0.0')
  .argument('<url>', 'Image URL or car listing page URL')
  .option('-o, --output <dir>', 'Output directory', OUTPUT_DIR)
  .option('-t, --text <text>', 'Overlay text', OVERLAY_TEXT)
  .option('-c, --color <color>', 'Overlay background color (hex)', OVERLAY_BG_COLOR)
  .action(async (url, opts) => {
    if (!isValidUrl(url)) {
      console.error('Error: Invalid URL. Please provide a valid HTTP/HTTPS URL.');
      process.exit(1);
    }

    console.log('=== Plate Masker ===');
    console.log(`URL:    ${url}`);
    console.log(`Output: ${opts.output}`);
    console.log(`Text:   ${opts.text}`);
    console.log(`Color:  ${opts.color}`);

    try {
      const results = await processUrl(url, {
        output: opts.output,
        text: opts.text,
        color: opts.color,
      });

      console.log('\n=== Summary ===');
      for (const r of results) {
        const status = r.platesFound > 0
          ? `${r.platesFound} plate(s) masked`
          : 'no plates found (original saved)';
        console.log(`  ${r.filename}: ${status}`);
      }
      console.log(`\nDone! ${results.length} image(s) processed.`);
    } catch (err) {
      console.error(`\nError: ${err.message}`);
      process.exit(1);
    }
  });

program.parse();
