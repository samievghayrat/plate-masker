import sharp from 'sharp';
import {
  OVERLAY_BG_COLOR,
  JPEG_QUALITY,
} from './config.mjs';

function generateSvgOverlay(bbox, bgColor, angle) {
  const totalW = bbox.x1 - bbox.x0;
  const totalH = bbox.y1 - bbox.y0;

  // When rotated, we need a larger canvas to avoid clipping
  const rad = Math.abs(angle) * (Math.PI / 180);
  const canvasW = Math.ceil(totalW * Math.cos(rad) + totalH * Math.sin(rad)) + 2;
  const canvasH = Math.ceil(totalW * Math.sin(rad) + totalH * Math.cos(rad)) + 2;

  const cx = canvasW / 2;
  const cy = canvasH / 2;

  const svg = `<svg width="${canvasW}" height="${canvasH}" xmlns="http://www.w3.org/2000/svg">
  <g transform="rotate(${angle}, ${cx}, ${cy})">
    <rect x="${(canvasW - totalW) / 2}" y="${(canvasH - totalH) / 2}" width="${totalW}" height="${totalH}" fill="${bgColor}" rx="3" ry="3"/>
  </g>
</svg>`;

  return { svg, canvasW, canvasH };
}

export async function applyWatermark(imageBuffer) {
  const metadata = await sharp(imageBuffer).metadata();
  const imgW = metadata.width;
  const imgH = metadata.height;

  const text = 'GHAYRAT +82-10-9922-1601';
  const fontSize = Math.max(14, Math.round(imgW * 0.02));
  const padX = Math.round(fontSize * 0.5);
  const padY = Math.round(fontSize * 0.3);
  const bgW = Math.round(text.length * fontSize * 0.6 + padX * 2);
  const bgH = Math.round(fontSize + padY * 2);

  const svg = `<svg width="${bgW}" height="${bgH}" xmlns="http://www.w3.org/2000/svg">
  <rect x="0" y="0" width="${bgW}" height="${bgH}" fill="rgba(0,0,0,0.5)" rx="4" ry="4"/>
  <text x="${padX}" y="${fontSize + padY - 2}" font-family="Arial, sans-serif" font-size="${fontSize}" fill="white">${text}</text>
</svg>`;

  return sharp(imageBuffer)
    .composite([{ input: Buffer.from(svg), left: 10, top: 10 }])
    .jpeg({ quality: JPEG_QUALITY })
    .toBuffer();
}

export async function applyOverlays(imageBuffer, plates, options = {}) {
  const bgColor = options.color || OVERLAY_BG_COLOR;

  if (plates.length === 0) {
    return imageBuffer;
  }

  const metadata = await sharp(imageBuffer).metadata();
  const imgW = metadata.width;
  const imgH = metadata.height;
  const composites = [];

  for (const bbox of plates) {
    const angle = bbox.angle || 0;
    const { svg, canvasW, canvasH } = generateSvgOverlay(bbox, bgColor, angle);
    const svgBuffer = Buffer.from(svg);

    // Skip if overlay is larger than the image
    if (canvasW > imgW || canvasH > imgH) continue;

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
