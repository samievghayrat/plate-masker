import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import axios from 'axios';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MODEL_DIR = path.join(__dirname, '..', 'models');
const MODEL_FILE = 'license-plate-finetune-v1n.onnx';
const MODEL_PATH = path.join(MODEL_DIR, MODEL_FILE);
const MODEL_URL = `https://huggingface.co/morsetechlab/yolov11-license-plate-detection/resolve/main/${MODEL_FILE}`;

async function download() {
  if (fs.existsSync(MODEL_PATH)) {
    const stat = fs.statSync(MODEL_PATH);
    console.log(`Model already exists (${(stat.size / 1e6).toFixed(1)} MB): ${MODEL_PATH}`);
    return;
  }

  fs.mkdirSync(MODEL_DIR, { recursive: true });
  console.log(`Downloading ${MODEL_FILE} from Hugging Face...`);

  const response = await axios.get(MODEL_URL, { responseType: 'arraybuffer' });
  fs.writeFileSync(MODEL_PATH, Buffer.from(response.data));

  const stat = fs.statSync(MODEL_PATH);
  console.log(`Downloaded ${(stat.size / 1e6).toFixed(1)} MB to ${MODEL_PATH}`);
}

download().catch((err) => {
  console.error('Failed to download model:', err.message);
  process.exit(1);
});
