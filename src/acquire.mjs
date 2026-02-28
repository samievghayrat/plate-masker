import axios from 'axios';
import * as cheerio from 'cheerio';
import puppeteer from 'puppeteer';
import sharp from 'sharp';
import { URL } from 'url';
import { sanitizeFilename } from './utils.mjs';
import {
  BROWSER_HEADLESS,
  BROWSER_TIMEOUT,
  KCAR_USER_ID,
  KCAR_USER_PW,
} from './config.mjs';

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';

// URL patterns that indicate non-car images (profile photos, icons, logos, etc.)
const NON_CAR_URL_PATTERNS = ['/avatar/', '/profile/', '/logo/', '/icon/', '/badge/', '/favicon/', '/stamp/', '/trans.'];

const MIN_WIDTH = 600;
const MIN_HEIGHT = 300;
const MIN_ASPECT_RATIO = 1.2;

function isNonCarUrl(url) {
  const lower = url.toLowerCase();
  return NON_CAR_URL_PATTERNS.some((pattern) => lower.includes(pattern));
}

async function filterCarImages(images) {
  const filtered = [];
  for (const img of images) {
    try {
      const metadata = await sharp(img.buffer).metadata();
      const w = metadata.width || 0;
      const h = metadata.height || 0;
      const aspect = h > 0 ? w / h : 0;

      if (w < MIN_WIDTH || h < MIN_HEIGHT || aspect < MIN_ASPECT_RATIO) {
        console.log(`[acquire] Filtered out ${img.filename} (${w}x${h}, aspect ${aspect.toFixed(2)})`);
        continue;
      }
      filtered.push(img);
    } catch {
      // If sharp can't read it, skip it
      console.warn(`[acquire] Filtered out ${img.filename} (unreadable image)`);
    }
  }
  return filtered;
}

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

  // Resolve relative URLs and filter out non-car patterns
  const resolved = [];
  for (const u of urls) {
    try {
      const full = new URL(u, baseUrl).href;
      if (isNonCarUrl(full)) {
        console.log(`[acquire] Skipping non-car URL: ${full}`);
        continue;
      }
      resolved.push(full);
    } catch {
      // skip invalid URLs
    }
  }

  return resolved;
}

// Encar-specific acquisition: extract base image URL from HTML, then fetch all carousel images
async function acquireEncar(url) {
  console.log('[acquire] Encar detected — fetching page to discover image pattern...');
  const resp = await axios.get(url, {
    headers: { 'User-Agent': USER_AGENT },
    timeout: 30000,
    maxRedirects: 5,
  });

  const html = typeof resp.data === 'string' ? resp.data : resp.data.toString();

  // Find a ci.encar.com car picture URL to extract the base path and car ID
  // Pattern: ci.encar.com/carpicture/.../pic{XXXX}/{carId}_{NNN}.jpg?...
  const ciPattern = /https?:\/\/ci\.encar\.com\/carpicture\/[^"'\s]*?\/pic(\d{4})\/(\d+)_(\d{3})\.jpg/;
  const match = html.match(ciPattern);

  if (!match) {
    console.log('[acquire] Could not find Encar image pattern, falling back to static scraper');
    return acquireStatic(url);
  }

  // Reconstruct the base URL path
  // Find the full base path (everything before {carId}_{NNN}.jpg)
  const fullMatch = match[0];
  const carId = match[2];
  const basePath = fullMatch.substring(0, fullMatch.lastIndexOf('/') + 1);
  // Use high-res params
  const hiResParams = '?impolicy=heightRate&rh=696&cw=1160&ch=696&cg=Center';

  console.log(`[acquire] Encar car ID: ${carId}, base: ${basePath}`);

  // Try fetching images 001-030
  const imageNums = [];
  for (let i = 1; i <= 30; i++) {
    imageNums.push(String(i).padStart(3, '0'));
  }

  const images = [];
  const downloadPromises = imageNums.map(async (num) => {
    const imgUrl = `${basePath}${carId}_${num}.jpg${hiResParams}`;
    try {
      const img = await downloadImage(imgUrl);
      return img;
    } catch {
      return null; // 404 — image doesn't exist
    }
  });

  const results = await Promise.all(downloadPromises);
  for (const img of results) {
    if (img) {
      images.push(img);
      console.log(`[acquire] Downloaded: ${img.filename}`);
    }
  }

  if (images.length === 0) {
    console.log('[acquire] No carousel images found, falling back to static scraper');
    return acquireStatic(url);
  }

  const carImages = await filterCarImages(images);
  console.log(`[acquire] Encar: ${carImages.length}/${images.length} image(s) passed car-image filter`);

  if (carImages.length === 0) {
    throw new Error('No car-sized images found after filtering');
  }

  return carImages;
}

// Static acquisition (axios + cheerio) — works for KB차차차, etc.
async function acquireStatic(url) {
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

  const carImages = await filterCarImages(images);
  if (carImages.length === 0) {
    throw new Error('No car-sized images found after filtering');
  }

  console.log(`[acquire] ${carImages.length}/${images.length} image(s) passed car-image filter`);
  return carImages;
}

// Browser-based acquisition for Kcar Auction (login + terms + SPA scraping)
async function acquireKcarAuction(url, credentials) {
  const userId = credentials.userId || KCAR_USER_ID;
  const userPw = credentials.userPw || KCAR_USER_PW;

  if (!userId || !userPw) {
    throw new Error(
      'Kcar credentials required. Set KCAR_USER_ID/KCAR_USER_PW in .env or use --kcar-user/--kcar-pass flags.'
    );
  }

  console.log('[acquire] Launching browser for Kcar Auction...');
  const browser = await puppeteer.launch({
    headless: BROWSER_HEADLESS,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  try {
    const page = await browser.newPage();
    await page.setUserAgent(USER_AGENT);
    page.setDefaultNavigationTimeout(BROWSER_TIMEOUT);
    page.setDefaultTimeout(BROWSER_TIMEOUT);

    // Step 1: Navigate to login page
    console.log('[acquire] Navigating to Kcar login page...');
    await page.goto('https://www.kcarauction.com/kcar/user/user_login.do', {
      waitUntil: 'networkidle2',
    });

    // Step 2: Fill login form
    console.log('[acquire] Filling login credentials...');
    await page.type('#user_id', userId, { delay: 50 });
    await page.type('#user_pw', userPw, { delay: 50 });

    // Step 3: Submit login via the specific login button
    console.log('[acquire] Submitting login...');
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle2' }),
      page.click('#btn_userJoin'),
    ]);
    console.log('[acquire] Login submitted, current URL:', page.url());

    // Step 4: Handle terms agreement page (user_confirm.do)
    if (page.url().includes('user_confirm.do')) {
      console.log('[acquire] Terms agreement page detected, agreeing...');
      await page.evaluate(() => encar.fnAgreeBid('Y'));
      await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 }).catch(() => {});
      console.log('[acquire] Terms agreed, current URL:', page.url());
    }

    // Step 5: Navigate to the target car detail URL
    console.log(`[acquire] Navigating to car detail: ${url}`);
    await page.goto(url, { waitUntil: 'networkidle2' });

    // Step 6: Scroll to trigger lazy-loaded images
    console.log('[acquire] Scrolling page to load lazy images...');
    for (let i = 0; i < 15; i++) {
      await page.evaluate(() => window.scrollBy(0, 300));
      await new Promise((r) => setTimeout(r, 300));
    }
    await page.evaluate(() => window.scrollTo(0, 0));
    await new Promise((r) => setTimeout(r, 2000));

    // Step 7: Extract car image URLs from the rendered DOM
    console.log('[acquire] Extracting car image URLs from rendered page...');
    const imageUrls = await page.evaluate(() => {
      const imgs = [...document.querySelectorAll('img')];
      const urls = [];
      for (const img of imgs) {
        const src = img.src || img.dataset.src || img.dataset.lazySrc || '';
        if (!src || src.startsWith('data:')) continue;

        // Filter: prefer images wider than 400px (car photos, not icons/logos)
        const naturalW = img.naturalWidth || 0;
        const displayW = img.width || 0;
        const w = naturalW || displayW;
        if (w > 400 || w === 0) {
          // w === 0 means not yet measured; include it and filter later
          urls.push(src);
        }
      }
      return [...new Set(urls)];
    });

    // Filter out non-car URL patterns
    const filteredUrls = imageUrls.filter((u) => {
      if (isNonCarUrl(u)) {
        console.log(`[acquire] Skipping non-car URL: ${u}`);
        return false;
      }
      return true;
    });

    console.log(`[acquire] Found ${filteredUrls.length} candidate image(s) (${imageUrls.length} before URL filter)`);

    if (filteredUrls.length === 0) {
      throw new Error('No car images found on the Kcar auction page');
    }

    // Step 8: Download each image
    const images = [];
    for (const imgUrl of filteredUrls) {
      try {
        console.log(`[acquire] Downloading: ${imgUrl}`);
        const img = await downloadImage(imgUrl);
        images.push(img);
      } catch (err) {
        console.warn(`[acquire] Failed to download ${imgUrl}: ${err.message}`);
      }
    }

    if (images.length === 0) {
      throw new Error('Failed to download any images from Kcar auction page');
    }

    const carImages = await filterCarImages(images);
    if (carImages.length === 0) {
      throw new Error('No car-sized images found after filtering');
    }

    console.log(`[acquire] Successfully downloaded ${carImages.length} car image(s) from Kcar (${images.length} total)`);
    return carImages;
  } finally {
    await browser.close();
    console.log('[acquire] Browser closed');
  }
}

// Router: pick acquisition strategy based on URL
export async function acquireImages(url, options = {}) {
  if (url.includes('kcarauction.com')) {
    return acquireKcarAuction(url, {
      userId: options.kcarUser,
      userPw: options.kcarPass,
    });
  }

  if (url.includes('encar.com')) {
    return acquireEncar(url);
  }

  // Default: static acquisition (KB차차차, direct image URLs, etc.)
  return acquireStatic(url);
}
