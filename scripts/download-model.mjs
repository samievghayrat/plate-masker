import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import axios from 'axios';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MODEL_DIR = path.join(__dirname, '..', 'models');
const MODEL_FILE = 'license-plate-finetune-v1n.onnx';
const MODEL_PATH = path.join(MODEL_DIR, MODEL_FILE);
const MODEL_URL = `https://huggingface.co/morsetechlab/yolov11-license-plate-detection/resolve/main/${MODEL_FILE}`;

async function download(retries = 3) {
  if (fs.existsSync(MODEL_PATH)) {
    const stat = fs.statSync(MODEL_PATH);
    console.log(`Model already exists (${(stat.size / 1e6).toFixed(1)} MB): ${MODEL_PATH}`);
    return;
  }

  fs.mkdirSync(MODEL_DIR, { recursive: true });

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      console.log(`Downloading ${MODEL_FILE} from Hugging Face (attempt ${attempt}/${retries})...`);
      const response = await axios.get(MODEL_URL, {
        responseType: 'arraybuffer',
        timeout: 60000,
      });
      fs.writeFileSync(MODEL_PATH, Buffer.from(response.data));
      const stat = fs.statSync(MODEL_PATH);
      console.log(`Downloaded ${(stat.size / 1e6).toFixed(1)} MB to ${MODEL_PATH}`);
      return;
    } catch (err) {
      console.error(`Attempt ${attempt} failed: ${err.message}`);
      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, 3000));
      }
    }
  }

  console.error('Model download failed after all retries. Will retry at server startup.');
}

download().catch((err) => {
  console.error('Failed to download model:', err.message);
  // Do not exit(1) — allow build to continue; model will be downloaded at startup
});
