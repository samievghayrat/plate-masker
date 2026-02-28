import ort from 'onnxruntime-node';
import sharp from 'sharp';
import {
  MODEL_PATH,
  YOLO_INPUT_SIZE,
  YOLO_CONFIDENCE_THRESHOLD,
  YOLO_IOU_THRESHOLD,
} from './config.mjs';

// --- A. Session management ---

let session = null;

async function getSession() {
  if (!session) {
    console.log('[detect] Loading YOLO ONNX model...');
    session = await ort.InferenceSession.create(MODEL_PATH);
    console.log('[detect] Model loaded');
  }
  return session;
}

export async function terminateWorker() {
  if (session) {
    await session.release();
    session = null;
  }
}

// --- B. Preprocessing ---

async function preprocess(imageBuffer) {
  const meta = await sharp(imageBuffer).metadata();
  const origW = meta.width;
  const origH = meta.height;
  const inputSize = YOLO_INPUT_SIZE;

  // Letterbox: scale to fit inputSize while preserving aspect ratio
  const scale = Math.min(inputSize / origW, inputSize / origH);
  const newW = Math.round(origW * scale);
  const newH = Math.round(origH * scale);
  const padX = Math.round((inputSize - newW) / 2);
  const padY = Math.round((inputSize - newH) / 2);

  // Resize and pad with gray (114)
  const rgbBuffer = await sharp(imageBuffer)
    .resize(newW, newH, { fit: 'fill' })
    .removeAlpha()
    .toFormat('raw')
    .toBuffer();

  // Build NCHW Float32Array [1, 3, 640, 640] normalized to [0,1]
  const pixels = inputSize * inputSize;
  const float32 = new Float32Array(3 * pixels);

  // Fill with gray (114/255)
  const gray = 114 / 255;
  float32.fill(gray);

  for (let y = 0; y < newH; y++) {
    for (let x = 0; x < newW; x++) {
      const srcIdx = (y * newW + x) * 3;
      const dstX = x + padX;
      const dstY = y + padY;
      const dstIdx = dstY * inputSize + dstX;

      float32[dstIdx] = rgbBuffer[srcIdx] / 255;                   // R
      float32[pixels + dstIdx] = rgbBuffer[srcIdx + 1] / 255;      // G
      float32[2 * pixels + dstIdx] = rgbBuffer[srcIdx + 2] / 255;  // B
    }
  }

  const tensor = new ort.Tensor('float32', float32, [1, 3, inputSize, inputSize]);
  return { tensor, origW, origH, scale, padX, padY };
}

// --- C. Postprocessing ---

function computeIoU(a, b) {
  const ix0 = Math.max(a.x0, b.x0);
  const iy0 = Math.max(a.y0, b.y0);
  const ix1 = Math.min(a.x1, b.x1);
  const iy1 = Math.min(a.y1, b.y1);
  if (ix0 >= ix1 || iy0 >= iy1) return 0;
  const inter = (ix1 - ix0) * (iy1 - iy0);
  const aArea = (a.x1 - a.x0) * (a.y1 - a.y0);
  const bArea = (b.x1 - b.x0) * (b.y1 - b.y0);
  return inter / (aArea + bArea - inter);
}

function nms(detections, iouThreshold) {
  const sorted = [...detections].sort((a, b) => b.confidence - a.confidence);
  const keep = [];
  for (const det of sorted) {
    let dominated = false;
    for (const kept of keep) {
      if (computeIoU(det, kept) > iouThreshold) {
        dominated = true;
        break;
      }
    }
    if (!dominated) keep.push(det);
  }
  return keep;
}

function parseOutput(outputTensor, scale, padX, padY, origW, origH) {
  const shape = outputTensor.dims;
  const data = outputTensor.data;
  const detections = [];

  // YOLO output can be [1, 5, N] or [1, N, 5]
  let numDetections, stride;
  let transposed = false;

  if (shape.length === 3 && shape[1] === 5) {
    // [1, 5, N] — standard YOLOv8/v11 format
    numDetections = shape[2];
    transposed = false;
  } else if (shape.length === 3 && shape[2] === 5) {
    // [1, N, 5]
    numDetections = shape[1];
    transposed = true;
  } else {
    console.warn(`[detect] Unexpected output shape: [${shape}]`);
    return [];
  }

  for (let i = 0; i < numDetections; i++) {
    let cx, cy, w, h, conf;
    if (transposed) {
      const offset = i * 5;
      cx = data[offset];
      cy = data[offset + 1];
      w = data[offset + 2];
      h = data[offset + 3];
      conf = data[offset + 4];
    } else {
      cx = data[i];
      cy = data[numDetections + i];
      w = data[2 * numDetections + i];
      h = data[3 * numDetections + i];
      conf = data[4 * numDetections + i];
    }

    if (conf < YOLO_CONFIDENCE_THRESHOLD) continue;

    // Convert from letterboxed coords to original image coords
    const x0 = (cx - w / 2 - padX) / scale;
    const y0 = (cy - h / 2 - padY) / scale;
    const x1 = (cx + w / 2 - padX) / scale;
    const y1 = (cy + h / 2 - padY) / scale;

    // Clamp to image bounds
    detections.push({
      x0: Math.max(0, Math.round(x0)),
      y0: Math.max(0, Math.round(y0)),
      x1: Math.min(origW, Math.round(x1)),
      y1: Math.min(origH, Math.round(y1)),
      confidence: conf,
    });
  }

  return nms(detections, YOLO_IOU_THRESHOLD);
}

// --- D. Plate refinement (compute actual plate size from bbox + angle) ---

// Standard Korean plate aspect ratio: 520mm x 110mm
const PLATE_ASPECT_RATIO = 4.73;

async function refinePlate(imageBuffer, bbox, imgW, imgH) {
  const bw = bbox.x1 - bbox.x0;
  const bh = bbox.y1 - bbox.y0;
  const bboxAspect = bw / bh;

  // Detect rotation angle using horizontal edge gradients within the bbox
  const angle = await detectAngle(imageBuffer, bbox, imgW, imgH);

  // Use the angle to compute actual plate dimensions from the axis-aligned bbox
  // An axis-aligned bbox around a rotated rectangle (W x H at angle θ):
  //   BB_w = W*cos(θ) + H*sin(θ)
  //   BB_h = W*sin(θ) + H*cos(θ)
  // Solving for W and H:
  //   W = (BB_w*cos(θ) - BB_h*sin(θ)) / cos(2θ)
  //   H = (BB_h*cos(θ) - BB_w*sin(θ)) / cos(2θ)
  const rad = Math.abs(angle) * (Math.PI / 180);
  const cos2 = Math.cos(2 * rad);

  let plateW, plateH;
  if (Math.abs(cos2) > 0.1 && Math.abs(angle) > 1.5) {
    // Significant angle — compute actual dimensions
    plateW = (bw * Math.cos(rad) - bh * Math.sin(rad)) / cos2;
    plateH = (bh * Math.cos(rad) - bw * Math.sin(rad)) / cos2;

    // Sanity check: aspect ratio should be plate-like (between 2.5:1 and 7:1)
    if (plateW / plateH < 2.5 || plateW / plateH > 7 || plateH < 5) {
      plateW = bw;
      plateH = bw / PLATE_ASPECT_RATIO;
    }
  } else if (bboxAspect < 4.0) {
    // Nearly straight but bbox is too square — use standard aspect ratio
    plateW = bw;
    plateH = bw / PLATE_ASPECT_RATIO;
  } else {
    // Good bbox, use as-is
    plateW = bw;
    plateH = bh;
  }

  // Center on the original bbox center
  const cx = (bbox.x0 + bbox.x1) / 2;
  const cy = (bbox.y0 + bbox.y1) / 2;

  const x0 = Math.max(0, Math.round(cx - plateW / 2));
  const y0 = Math.max(0, Math.round(cy - plateH / 2));
  const x1 = Math.min(imgW, Math.round(cx + plateW / 2));
  const y1 = Math.min(imgH, Math.round(cy + plateH / 2));

  console.log(`[detect]   refinement: angle=${angle.toFixed(1)}° size=${Math.round(plateW)}x${Math.round(plateH)} (was ${bw}x${bh})`);

  return { x0, y0, x1, y1, angle };
}

async function detectAngle(imageBuffer, bbox, imgW, imgH) {
  const bw = bbox.x1 - bbox.x0;
  const bh = bbox.y1 - bbox.y0;
  if (bw < 10 || bh < 10) return 0;

  // Extract just the bbox region as grayscale
  const grayBuf = await sharp(imageBuffer)
    .extract({ left: bbox.x0, top: bbox.y0, width: bw, height: bh })
    .grayscale()
    .raw()
    .toBuffer();

  // Compute vertical Sobel gradient (finds horizontal edges)
  // Strong horizontal edges = top and bottom of plate
  const gradY = new Float32Array(bw * bh);
  for (let y = 1; y < bh - 1; y++) {
    for (let x = 0; x < bw; x++) {
      gradY[y * bw + x] = Math.abs(
        grayBuf[(y + 1) * bw + x] - grayBuf[(y - 1) * bw + x]
      );
    }
  }

  // Find rows with strongest horizontal edges (top half = top edge, bottom half = bottom edge)
  const midY = Math.floor(bh / 2);

  // For each column, find the strongest edge pixel in top half and bottom half
  const topEdge = [];
  const botEdge = [];

  for (let x = Math.floor(bw * 0.1); x < Math.floor(bw * 0.9); x++) {
    let maxGradTop = 0, bestYTop = 0;
    for (let y = 1; y < midY; y++) {
      if (gradY[y * bw + x] > maxGradTop) {
        maxGradTop = gradY[y * bw + x];
        bestYTop = y;
      }
    }
    if (maxGradTop > 15) topEdge.push({ x, y: bestYTop });

    let maxGradBot = 0, bestYBot = bh - 1;
    for (let y = midY; y < bh - 1; y++) {
      if (gradY[y * bw + x] > maxGradBot) {
        maxGradBot = gradY[y * bw + x];
        bestYBot = y;
      }
    }
    if (maxGradBot > 15) botEdge.push({ x, y: bestYBot });
  }

  function fitLine(points) {
    if (points.length < 3) return { slope: 0 };
    const n = points.length;
    let sx = 0, sy = 0, sxy = 0, sx2 = 0;
    for (const p of points) { sx += p.x; sy += p.y; sxy += p.x * p.y; sx2 += p.x * p.x; }
    const denom = n * sx2 - sx * sx;
    if (Math.abs(denom) < 1e-6) return { slope: 0 };
    return { slope: (n * sxy - sx * sy) / denom };
  }

  function robustFitLine(points) {
    if (points.length < 5) return fitLine(points);
    let line = fitLine(points);
    const residuals = points.map(p => Math.abs(p.y - (line.slope * p.x + (0))));
    const med = [...residuals].sort((a, b) => a - b)[Math.floor(residuals.length / 2)];
    const inliers = points.filter((_, i) => residuals[i] < Math.max(med * 2.5, 3));
    if (inliers.length >= 3) line = fitLine(inliers);
    return line;
  }

  const topSlope = topEdge.length >= 3 ? robustFitLine(topEdge).slope : 0;
  const botSlope = botEdge.length >= 3 ? robustFitLine(botEdge).slope : 0;
  const avgSlope = (topSlope + botSlope) / 2;
  const angle = Math.atan(avgSlope) * (180 / Math.PI);

  return Math.max(-20, Math.min(20, angle));
}

// --- E. Main export ---

export async function detectPlates(imageBuffer) {
  const metadata = await sharp(imageBuffer).metadata();
  const imageWidth = metadata.width;
  const imageHeight = metadata.height;
  console.log(`[detect] Image: ${imageWidth}x${imageHeight}`);

  const sess = await getSession();
  const { tensor, origW, origH, scale, padX, padY } = await preprocess(imageBuffer);

  // Run inference
  const inputName = sess.inputNames[0];
  const results = await sess.run({ [inputName]: tensor });
  const outputName = sess.outputNames[0];
  const outputTensor = results[outputName];

  console.log(`[detect] Output shape: [${outputTensor.dims}]`);

  const detections = parseOutput(outputTensor, scale, padX, padY, origW, origH);

  const plates = [];
  for (const det of detections) {
    console.log(`[detect]   plate: (${det.x0},${det.y0})-(${det.x1},${det.y1}) conf=${det.confidence.toFixed(3)}`);
    const refined = await refinePlate(imageBuffer, det, imageWidth, imageHeight);
    plates.push({ x0: refined.x0, y0: refined.y0, x1: refined.x1, y1: refined.y1, angle: refined.angle });
  }

  console.log(`[detect] Result: ${plates.length} plate(s)`);
  return { plates, imageWidth, imageHeight };
}
