import sharp from 'sharp';
import {
  OVERLAY_TEXT,
  OVERLAY_BG_COLOR,
  OVERLAY_TEXT_COLOR,
  JPEG_QUALITY,
} from './config.mjs';
import { xmlEscape } from './utils.mjs';

function generateSvgOverlay(bbox, text, bgColor, textColor, angle) {
  const totalW = bbox.x1 - bbox.x0;
  const totalH = bbox.y1 - bbox.y0;

  // Scale font to fit within the plate bbox
  const maxFontByHeight = totalH * 0.65;
  const maxFontByWidth = (totalW * 0.9) / (text.length * 0.55);
  const fontSize = Math.max(8, Math.floor(Math.min(maxFontByHeight, maxFontByWidth)));

  const escapedText = xmlEscape(text);

  // When rotated, we need a larger canvas to avoid clipping
  const rad = Math.abs(angle) * (Math.PI / 180);
  const canvasW = Math.ceil(totalW * Math.cos(rad) + totalH * Math.sin(rad)) + 2;
  const canvasH = Math.ceil(totalW * Math.sin(rad) + totalH * Math.cos(rad)) + 2;

  const cx = canvasW / 2;
  const cy = canvasH / 2;

  const svg = `<svg width="${canvasW}" height="${canvasH}" xmlns="http://www.w3.org/2000/svg">
  <g transform="rotate(${angle}, ${cx}, ${cy})">
    <rect x="${(canvasW - totalW) / 2}" y="${(canvasH - totalH) / 2}" width="${totalW}" height="${totalH}" fill="${bgColor}" rx="3" ry="3"/>
    <text x="${cx}" y="${cy}" text-anchor="middle" dominant-baseline="central"
          font-family="Arial, Helvetica, sans-serif" font-size="${fontSize}" font-weight="bold"
          fill="${textColor}">${escapedText}</text>
  </g>
</svg>`;

  return { svg, canvasW, canvasH };
}

export async function applyOverlays(imageBuffer, plates, options = {}) {
  const text = options.text || OVERLAY_TEXT;
  const bgColor = options.color || OVERLAY_BG_COLOR;
  const textColor = OVERLAY_TEXT_COLOR;

  if (plates.length === 0) {
    return imageBuffer;
  }

  const metadata = await sharp(imageBuffer).metadata();
  const imgW = metadata.width;
  const imgH = metadata.height;
  const composites = [];

  for (const bbox of plates) {
    const angle = bbox.angle || 0;
    const { svg, canvasW, canvasH } = generateSvgOverlay(
      bbox, text, bgColor, textColor, angle
    );
    const svgBuffer = Buffer.from(svg);

    // Center the rotated overlay on the bbox center
    const bboxCx = (bbox.x0 + bbox.x1) / 2;
    const bboxCy = (bbox.y0 + bbox.y1) / 2;
    const left = Math.max(0, Math.min(Math.round(bboxCx - canvasW / 2), imgW - canvasW));
    const top = Math.max(0, Math.min(Math.round(bboxCy - canvasH / 2), imgH - canvasH));

    composites.push({
      input: svgBuffer,
      left,
      top,
    });
  }

  const result = await sharp(imageBuffer)
    .composite(composites)
    .jpeg({ quality: options.quality || JPEG_QUALITY })
    .toBuffer();

  return result;
}
