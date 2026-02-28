import axios from 'axios';
import * as cheerio from 'cheerio';
import { URL } from 'url';
import { sanitizeFilename } from './utils.mjs';

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';

async function classifyUrl(url) {
  try {
    const resp = await axios.head(url, {
      headers: { 'User-Agent': USER_AGENT },
      timeout: 10000,
      maxRedirects: 5,
    });
    const contentType = resp.headers['content-type'] || '';
    if (contentType.startsWith('image/')) return 'image';
    if (contentType.includes('text/html')) return 'html';
    return 'unknown';
  } catch {
    // HEAD might be blocked; try GET and check content-type
    return 'unknown';
  }
}

async function downloadImage(url) {
  const resp = await axios.get(url, {
    responseType: 'arraybuffer',
    headers: { 'User-Agent': USER_AGENT },
    timeout: 30000,
    maxRedirects: 5,
  });
  const buffer = Buffer.from(resp.data);
  const filename = sanitizeFilename(url);
  return { buffer, filename, sourceUrl: url };
}

function extractImageUrls(html, baseUrl) {
  const $ = cheerio.load(html);
  const urls = new Set();

  // og:image meta tags
  $('meta[property="og:image"]').each((_, el) => {
    const content = $(el).attr('content');
    if (content) urls.add(content);
  });

  // Large images (likely car photos, not icons)
  $('img').each((_, el) => {
    const src = $(el).attr('src') || $(el).attr('data-src') || $(el).attr('data-lazy-src');
    if (src) urls.add(src);
  });

  // Resolve relative URLs
  const resolved = [];
  for (const u of urls) {
    try {
      const full = new URL(u, baseUrl).href;
      resolved.push(full);
    } catch {
      // skip invalid URLs
    }
  }

  return resolved;
}

export async function acquireImages(url) {
  console.log(`[acquire] Classifying URL: ${url}`);
  const type = await classifyUrl(url);
  console.log(`[acquire] URL type: ${type}`);

  if (type === 'image') {
    console.log('[acquire] Downloading single image...');
    const img = await downloadImage(url);
    return [img];
  }

  // For HTML or unknown, try fetching as HTML
  console.log('[acquire] Fetching page HTML...');
  const resp = await axios.get(url, {
    headers: { 'User-Agent': USER_AGENT },
    timeout: 30000,
    maxRedirects: 5,
  });

  const contentType = resp.headers['content-type'] || '';

  // If it turns out to be an image after all
  if (contentType.startsWith('image/')) {
    const buffer = Buffer.from(resp.data);
    const filename = sanitizeFilename(url);
    return [{ buffer, filename, sourceUrl: url }];
  }

  const html = typeof resp.data === 'string' ? resp.data : resp.data.toString();
  const imageUrls = extractImageUrls(html, url);
  console.log(`[acquire] Found ${imageUrls.length} image(s) on page`);

  if (imageUrls.length === 0) {
    throw new Error('No images found on the page');
  }

  const images = [];
  for (const imgUrl of imageUrls) {
    try {
      console.log(`[acquire] Downloading: ${imgUrl}`);
      const img = await downloadImage(imgUrl);
      images.push(img);
    } catch (err) {
      console.warn(`[acquire] Failed to download ${imgUrl}: ${err.message}`);
    }
  }

  if (images.length === 0) {
    throw new Error('Failed to download any images from the page');
  }

  return images;
}
