import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Overlay settings
export const OVERLAY_TEXT = '+82-10-9922-1601';
export const OVERLAY_BG_COLOR = '#FFFFFF';
export const OVERLAY_TEXT_COLOR = '#000000';
export const JPEG_QUALITY = 90;
export const OUTPUT_DIR = 'output';

// Padding around detected plate bbox (fraction of bbox size)
export const BBOX_PADDING = 0.35;

// YOLO model settings
export const MODEL_PATH = path.join(__dirname, '..', 'models', 'license-plate-finetune-v1n.onnx');
export const YOLO_INPUT_SIZE = 640;
export const YOLO_CONFIDENCE_THRESHOLD = 0.25;
export const YOLO_IOU_THRESHOLD = 0.45;
