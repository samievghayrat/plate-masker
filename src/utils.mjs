import { URL } from 'url';
import path from 'path';

export function isValidUrl(str) {
  try {
    const url = new URL(str);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

export function sanitizeFilename(name) {
  // Remove query strings and fragments
  const base = name.split('?')[0].split('#')[0];
  // Get just the filename part
  const filename = path.basename(base);
  // Replace unsafe characters
  return filename.replace(/[^a-zA-Z0-9._-]/g, '_') || 'image';
}

export function ensureJpegExtension(filename) {
  const ext = path.extname(filename).toLowerCase();
  if (['.jpg', '.jpeg', '.png', '.webp', '.bmp', '.gif'].includes(ext)) {
    return filename.replace(/\.[^.]+$/, '.jpg');
  }
  return filename + '.jpg';
}

export function xmlEscape(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
