import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Overlay settings
export const OVERLAY_BG_COLOR = '#FFFFFF';
export const JPEG_QUALITY = 90;
export const OUTPUT_DIR = 'output';

// Padding around detected plate bbox (fraction of bbox size)
export const BBOX_PADDING = 0.35;

// YOLO model settings
export const MODEL_PATH = path.join(__dirname, '..', 'models', 'license-plate-finetune-v1n.onnx');
export const YOLO_INPUT_SIZE = 640;
export const YOLO_CONFIDENCE_THRESHOLD = 0.4;
export const YOLO_IOU_THRESHOLD = 0.45;

// Browser automation settings
export const BROWSER_HEADLESS = true;
export const BROWSER_TIMEOUT = 30000;

// Kcar credentials (from env vars or CLI flags)
export const KCAR_USER_ID = process.env.KCAR_USER_ID || '';
export const KCAR_USER_PW = process.env.KCAR_USER_PW || '';
