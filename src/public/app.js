import { buildZip } from './zip.js';

const $ = (selector) => document.querySelector(selector);

const elements = {
  urlInput: $('#urlInput'),
  pasteBtn: $('#pasteBtn'),
  clearBtn: $('#clearBtn'),
  processBtn: $('#processBtn'),
  maskToggle: $('#maskPlatesToggle'),
  textToggle: $('#generateTextToggle'),
  watermarkToggle: $('#watermarkEnabled'),
  watermarkSettings: $('#watermarkSettings'),
  progressPanel: $('#progressPanel'),
  progressTitle: $('#progressTitle'),
  progressMessage: $('#progressMessage'),
  progressCount: $('#progressCount'),
  progressBar: $('#progressBar'),
  errorBox: $('#errorBox'),
  workspace: $('#workspace'),
  carSummary: $('#carSummary'),
  carTitle: $('#carTitle'),
  carSubtitle: $('#carSubtitle'),
  sourceLink: $('#sourceLink'),
  specGrid: $('#specGrid'),
  postPanel: $('#postPanel'),
  postText: $('#postText'),
  priceMode: $('#priceMode'),
  turnkeyPriceField: $('#turnkeyPriceField'),
  turnkeyPrice: $('#turnkeyPrice'),
  includeVin: $('#includeVin'),
  galleryPanel: $('#galleryPanel'),
  gallerySummary: $('#gallerySummary'),
  photoGrid: $('#photoGrid'),
  selectAll: $('#selectAll'),
  saveSelectedBtn: $('#saveSelectedBtn'),
  shareBundleBtn: $('#shareBundleBtn'),
  zipBtn: $('#zipBtn'),
  toast: $('#toast'),
  editorModal: $('#editorModal'),
  editorCanvas: $('#editorCanvas'),
  editorApplyBtn: $('#editorApplyBtn'),
};

const state = {
  jobId: '',
  car: null,
  images: [],
  selected: new Set(),
  coverFilename: '',
  fileCache: new Map(),
  editorFilename: '',
  editorImage: null,
  editorRects: [],
  drawStart: null,
  toastTimer: null,
  regenerateTimer: null,
};

function showToast(message) {
  clearTimeout(state.toastTimer);
  elements.toast.textContent = message;
  elements.toast.classList.add('visible');
  state.toastTimer = setTimeout(() => elements.toast.classList.remove('visible'), 2600);
}

function showError(message) {
  elements.errorBox.textContent = message;
  elements.errorBox.hidden = false;
  elements.errorBox.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function clearError() {
  elements.errorBox.hidden = true;
  elements.errorBox.textContent = '';
}

function setBusy(busy) {
  elements.processBtn.disabled = busy;
  elements.processBtn.querySelector('span').textContent = busy ? 'Обработка…' : 'Подготовить фото и объявление';
}

function updateOptionCard(toggle, cardSelector) {
  $(cardSelector).classList.toggle('selected', toggle.checked);
}

for (const [toggle, selector] of [
  [elements.maskToggle, '#maskOptionCard'],
  [elements.textToggle, '#textOptionCard'],
  [elements.watermarkToggle, '#watermarkOptionCard'],
]) {
  toggle.addEventListener('change', () => updateOptionCard(toggle, selector));
}

elements.watermarkToggle.addEventListener('change', () => {
  if (!elements.watermarkToggle.checked) elements.watermarkSettings.open = false;
});

elements.urlInput.addEventListener('input', () => {
  elements.clearBtn.classList.toggle('visible', Boolean(elements.urlInput.value));
});
elements.urlInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') processListing();
});
elements.clearBtn.addEventListener('click', () => {
  elements.urlInput.value = '';
  elements.clearBtn.classList.remove('visible');
  elements.urlInput.focus();
});
elements.pasteBtn.addEventListener('click', async () => {
  try {
    elements.urlInput.value = await navigator.clipboard.readText();
    elements.clearBtn.classList.toggle('visible', Boolean(elements.urlInput.value));
    elements.urlInput.focus();
  } catch {
    elements.urlInput.focus();
    showToast('Нажмите и удерживайте поле, чтобы вставить ссылку');
  }
});

function getWatermarkOptions() {
  if (!elements.watermarkToggle.checked) return { enabled: false };
  const lines = [$('#wmLine1').value, $('#wmLine2').value, $('#wmLine3').value]
    .map((line) => line.trim())
    .filter(Boolean);
  return { enabled: true, lines };
}

async function processListing() {
  const url = elements.urlInput.value.trim();
  if (!url) {
    showError('Сначала вставьте ссылку на объявление Encar или KB Chachacha.');
    elements.urlInput.focus();
    return;
  }

  try {
    new URL(url);
  } catch {
    showError('Похоже, это некорректная ссылка.');
    return;
  }

  clearError();
  setBusy(true);
  resetResults();
  elements.progressPanel.hidden = false;
  updateProgress({ stage: 'starting', current: 0, total: 1, message: 'Подключаемся к объявлению' });

  try {
    const response = await fetch('/api/process', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url,
        maskPlates: elements.maskToggle.checked,
        generateText: elements.textToggle.checked,
        watermark: getWatermarkOptions(),
      }),
    });
    const data = await response.json();
    if (!response.ok || data.error) throw new Error(data.error || 'Не удалось начать обработку');
    state.jobId = data.jobId;
    if (data.status === 'done') {
      renderWorkspace(data);
      return;
    }
    const result = await pollJob(data.jobId);
    if (result.status === 'error') throw new Error(result.error || 'Не удалось обработать объявление');
    renderWorkspace(result);
  } catch (error) {
    showError(error.message || 'Что-то пошло не так.');
  } finally {
    elements.progressPanel.hidden = true;
    setBusy(false);
  }
}

async function pollJob(jobId) {
  while (true) {
    const response = await fetch(`/api/jobs/${encodeURIComponent(jobId)}?t=${Date.now()}`, { cache: 'no-store' });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Не удалось получить состояние обработки');
    if (data.progress) updateProgress(data.progress);
    if (data.status === 'done' || data.status === 'error') return data;
    await new Promise((resolve) => setTimeout(resolve, 850));
  }
}

function updateProgress(progress) {
  const stageTitles = {
    starting: 'Запуск',
    details: 'Читаем данные автомобиля',
    download: 'Загружаем фотографии',
    mask: 'Скрываем госномера',
    prepare: 'Подготавливаем фотографии',
    done: 'Готово',
  };
  const base = { starting: 2, details: 6, download: 10, mask: 42, prepare: 42, done: 100 };
  const span = { download: 30, mask: 55, prepare: 55 };
  let percent = base[progress.stage] ?? 5;
  if (progress.total && span[progress.stage]) {
    percent += (Math.max(0, progress.current) / progress.total) * span[progress.stage];
  }
  elements.progressTitle.textContent = stageTitles[progress.stage] || 'Обработка';
  elements.progressMessage.textContent = progress.message || 'Пожалуйста, подождите…';
  elements.progressCount.textContent = progress.total > 1 ? `${progress.current}/${progress.total}` : '';
  elements.progressBar.style.width = `${Math.min(100, Math.max(5, percent))}%`;
}

function resetResults() {
  elements.workspace.hidden = true;
  elements.carSummary.hidden = true;
  elements.postPanel.hidden = true;
  elements.galleryPanel.hidden = true;
  elements.photoGrid.innerHTML = '';
  elements.postText.value = '';
  state.images = [];
  state.car = null;
  state.selected.clear();
  state.coverFilename = '';
  state.fileCache.clear();
}

function renderWorkspace(data) {
  state.car = data.car;
  state.images = data.results || [];
  elements.workspace.hidden = false;
  if (state.car) renderCarSummary(state.car);
  if (data.postText) {
    elements.postText.value = data.postText;
    elements.postPanel.hidden = false;
  }
  renderGallery(state.images);
  elements.workspace.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function formatNumber(value) {
  return new Intl.NumberFormat('en-US').format(Number(value) || 0);
}

function renderCarSummary(car) {
  const title = [car.brand, car.model, car.generationCode, car.trim].filter(Boolean).join(' ');
  elements.carTitle.textContent = title || 'Автомобиль из Кореи';
  elements.carSubtitle.textContent = `Найдено оригинальных фото: ${car.photoCount || state.images.length}`;
  elements.sourceLink.href = car.sourceUrl;
  elements.sourceLink.textContent = car.source === 'kbchachacha' ? 'Открыть KB Chachacha ↗' : 'Открыть Encar ↗';
  const year = car.year ? `${car.year}${car.month ? `/${String(car.month).padStart(2, '0')}` : ''}` : '—';
  const specs = [
    ['Год', year],
    ['Пробег', car.mileage ? `${formatNumber(car.mileage)} км` : '—'],
    ['Двигатель', [car.engine, car.fuel].filter(Boolean).join(' ') || '—'],
    ['Коробка', car.transmission || '—'],
    ['Цена в Корее', car.priceKrw ? `${formatNumber(car.priceKrw)} ₩` : '—'],
  ];
  elements.specGrid.replaceChildren(...specs.map(([label, value]) => {
    const item = document.createElement('div');
    item.className = 'spec-item';
    const labelEl = document.createElement('span');
    const valueEl = document.createElement('strong');
    labelEl.textContent = label;
    valueEl.textContent = value;
    item.append(labelEl, valueEl);
    return item;
  }));
  elements.carSummary.hidden = false;
}

function renderGallery(images, { preserveSelection = false } = {}) {
  elements.photoGrid.innerHTML = '';
  if (preserveSelection) {
    const filenames = new Set(images.map((image) => image.filename));
    state.selected = new Set([...state.selected].filter((filename) => filenames.has(filename)));
    if (!filenames.has(state.coverFilename)) state.coverFilename = '';
  } else {
    state.selected = new Set();
    state.coverFilename = '';
  }
  elements.selectAll.checked = false;
  elements.selectAll.indeterminate = false;
  const masked = images.filter((image) => image.platesFound > 0).length;
  const review = images.filter((image) => image.maskRequested && image.platesFound === 0).length;
  elements.gallerySummary.textContent = images[0]?.maskRequested
    ? `Фото: ${images.length} · номера скрыты: ${masked}${review ? ` · проверить: ${review}` : ''}`
    : `Готово фото без маскирования: ${images.length}`;

  images.forEach((image, index) => elements.photoGrid.append(createPhotoCard(image, index)));
  updateSelectionUi();
  elements.galleryPanel.hidden = false;

  // Warm the browser cache in the background so a later mobile share is immediate.
  if ('requestIdleCallback' in window) {
    requestIdleCallback(() => images.slice(0, 8).forEach((image) => getImageFile(image.filename).catch(() => {})));
  }
}

function createPhotoCard(image, index) {
  const isSelected = state.selected.has(image.filename);
  const isCover = state.coverFilename === image.filename;
  const card = document.createElement('article');
  card.className = `photo-card${isSelected ? '' : ' unselected'}${isCover ? ' cover' : ''}`;
  card.dataset.filename = image.filename;

  const selectLabel = document.createElement('label');
  selectLabel.className = 'photo-select';
  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.autocomplete = 'off';
  checkbox.checked = isSelected;
  checkbox.setAttribute('aria-label', `Выбрать ${image.filename}`);
  checkbox.addEventListener('change', () => {
    if (checkbox.checked) state.selected.add(image.filename);
    else {
      state.selected.delete(image.filename);
      if (state.coverFilename === image.filename) {
        state.coverFilename = '';
        renderGallery(state.images, { preserveSelection: true });
        return;
      }
    }
    card.classList.toggle('unselected', !checkbox.checked);
    updateSelectionUi();
  });
  selectLabel.append(checkbox);

  if (isCover) {
    const coverBadge = document.createElement('span');
    coverBadge.className = 'photo-cover-badge';
    coverBadge.textContent = 'Обложка';
    card.append(coverBadge);
  }

  const status = document.createElement('span');
  status.className = 'photo-status';
  if (!image.maskRequested) {
    status.classList.add('original');
    status.textContent = 'Без маски';
  } else if (image.platesFound > 0) {
    status.textContent = 'Номер скрыт';
  } else {
    status.classList.add('review');
    status.textContent = 'Проверить номер';
  }

  const photo = document.createElement('img');
  photo.src = imageUrl(image.filename);
  photo.alt = image.filename;
  photo.loading = 'lazy';
  photo.addEventListener('click', () => window.open(imageUrl(image.filename), '_blank', 'noopener'));

  const footer = document.createElement('div');
  footer.className = 'photo-footer';
  const name = document.createElement('span');
  name.textContent = `${index + 1}. ${image.filename}`;
  name.title = image.filename;
  const tools = document.createElement('div');
  tools.className = 'photo-tools';
  const coverBtn = miniButton(isCover ? 'Обложка ✓' : 'Обложка', () => makeCover(image.filename));
  coverBtn.disabled = isCover;
  const upBtn = miniButton('↑', () => movePhoto(image.filename, -1));
  upBtn.title = 'Переместить раньше';
  upBtn.setAttribute('aria-label', `Переместить ${image.filename} раньше`);
  upBtn.disabled = index === 0 || (Boolean(state.coverFilename) && index === 1);
  const downBtn = miniButton('↓', () => movePhoto(image.filename, 1));
  downBtn.title = 'Переместить позже';
  downBtn.setAttribute('aria-label', `Переместить ${image.filename} позже`);
  downBtn.disabled = index === state.images.length - 1 || isCover;
  const editBtn = miniButton('Скрыть', () => openEditor(image.filename));
  const retryBtn = miniButton('Найти', () => reprocessImage(image.filename, retryBtn, status));
  const saveBtn = miniButton('Скачать', () => saveOneImage(image.filename, saveBtn));
  tools.append(coverBtn, upBtn, downBtn, editBtn, retryBtn, saveBtn);
  footer.append(name, tools);
  card.append(selectLabel, status, photo, footer);
  return card;
}

function makeCover(filename) {
  const index = state.images.findIndex((image) => image.filename === filename);
  if (index < 0) return;
  const [image] = state.images.splice(index, 1);
  state.images.unshift(image);
  state.selected.add(filename);
  state.coverFilename = filename;
  renderGallery(state.images, { preserveSelection: true });
  showToast('Обложка выбрана и перемещена на первое место');
}

function movePhoto(filename, direction) {
  const index = state.images.findIndex((image) => image.filename === filename);
  const target = index + direction;
  const earliest = state.coverFilename ? 1 : 0;
  if (index < 0 || target < earliest || target >= state.images.length) return;
  [state.images[index], state.images[target]] = [state.images[target], state.images[index]];
  renderGallery(state.images, { preserveSelection: true });
}

function miniButton(label, handler) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'mini-btn';
  button.textContent = label;
  button.addEventListener('click', handler);
  return button;
}

function imageUrl(filename) {
  return state.images.find((image) => image.filename === filename)?.dataUrl
    || `/api/images/${encodeURIComponent(filename)}`;
}

function updateSelectionUi() {
  const count = state.selected.size;
  elements.selectAll.checked = count > 0 && count === state.images.length;
  elements.selectAll.indeterminate = count > 0 && count < state.images.length;
  elements.saveSelectedBtn.textContent = count ? `Сохранить выбранные (${count})` : 'Сначала выберите фото';
  elements.saveSelectedBtn.disabled = count === 0;
  elements.shareBundleBtn.disabled = count === 0;
  elements.zipBtn.disabled = count === 0;
}

elements.selectAll.addEventListener('change', () => {
  const checked = elements.selectAll.checked;
  state.selected = new Set(checked ? state.images.map((image) => image.filename) : []);
  if (!checked && state.coverFilename) {
    state.coverFilename = '';
    renderGallery(state.images, { preserveSelection: true });
    return;
  }
  for (const card of elements.photoGrid.querySelectorAll('.photo-card')) {
    card.querySelector('input[type="checkbox"]').checked = checked;
    card.classList.toggle('unselected', !checked);
  }
  updateSelectionUi();
});

async function regenerateText() {
  if (!state.jobId || !state.car) return;
  const response = await fetch('/api/generate-text', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      car: state.car,
      priceMode: elements.priceMode.value,
      turnkeyPrice: elements.turnkeyPrice.value,
      includeVin: elements.includeVin.checked,
    }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Не удалось создать текст');
  elements.postText.value = data.postText;
}

function scheduleRegenerate() {
  clearTimeout(state.regenerateTimer);
  state.regenerateTimer = setTimeout(() => regenerateText().catch((error) => showError(error.message)), 280);
}

elements.priceMode.addEventListener('change', () => {
  elements.turnkeyPriceField.hidden = elements.priceMode.value !== 'turnkey';
  scheduleRegenerate();
});
elements.turnkeyPrice.addEventListener('input', () => {
  const digits = elements.turnkeyPrice.value.replace(/\D/g, '');
  elements.turnkeyPrice.value = digits ? formatNumber(digits) : '';
  scheduleRegenerate();
});
elements.includeVin.addEventListener('change', scheduleRegenerate);
$('#regenerateBtn').addEventListener('click', () => regenerateText().then(() => showToast('Текст восстановлен из данных автомобиля')).catch((error) => showError(error.message)));

async function copyText(text) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const temporary = document.createElement('textarea');
  temporary.value = text;
  temporary.style.position = 'fixed';
  temporary.style.opacity = '0';
  document.body.append(temporary);
  temporary.select();
  document.execCommand('copy');
  temporary.remove();
}

$('#copyPostBtn').addEventListener('click', async () => {
  try {
    await copyText(elements.postText.value);
    showToast('Текст объявления скопирован');
  } catch (error) {
    showError(`Не удалось скопировать текст: ${error.message}`);
  }
});

$('#sharePostBtn').addEventListener('click', async () => {
  const text = elements.postText.value;
  try {
    if (navigator.share) await navigator.share({ title: elements.carTitle.textContent, text });
    else {
      await copyText(text);
      showToast('Отправка недоступна, поэтому текст скопирован');
    }
  } catch (error) {
    if (error.name !== 'AbortError') showError(`Не удалось поделиться: ${error.message}`);
  }
});

async function getImageFile(filename) {
  if (!state.fileCache.has(filename)) {
    state.fileCache.set(filename, fetch(imageUrl(filename)).then(async (response) => {
      if (!response.ok) throw new Error(`Не удалось загрузить ${filename}`);
      const blob = await response.blob();
      return new File([blob], filename, { type: blob.type || 'image/jpeg' });
    }).catch((error) => {
      state.fileCache.delete(filename);
      throw error;
    }));
  }
  return state.fileCache.get(filename);
}

async function getSelectedFiles() {
  const filenames = state.images.map((image) => image.filename).filter((name) => state.selected.has(name));
  const files = await Promise.all(filenames.map(getImageFile));
  return files.map((file, index) => new File(
    [file],
    `${String(index + 1).padStart(2, '0')}-${file.name}`,
    { type: file.type, lastModified: file.lastModified },
  ));
}

function hasAndroidGalleryBridge() {
  return typeof window.PlateMaskerAndroid?.startDownload === 'function';
}

async function shareFiles(files, text = '') {
  if (!navigator.share || !navigator.canShare?.({ files })) return false;
  try {
    await navigator.share({
      title: state.car ? `${state.car.brand} ${state.car.model}` : 'Фотографии автомобиля',
      text: text || undefined,
      files,
    });
    return true;
  } catch (error) {
    if (error.name === 'AbortError') throw error;
    if (error.name === 'NotAllowedError' || error.name === 'SecurityError') return false;
    throw error;
  }
}

async function withButtonProgress(button, workingLabel, action) {
  const original = button.textContent;
  button.disabled = true;
  button.textContent = workingLabel;
  try {
    return await action();
  } finally {
    button.disabled = false;
    button.textContent = original;
    updateSelectionUi();
  }
}

async function saveSelectedToGallery() {
  await withButtonProgress(elements.saveSelectedBtn, 'Подготавливаем фото…', async () => {
    const files = await getSelectedFiles();
    if (hasAndroidGalleryBridge()) {
      for (const file of files) await triggerDownload(file, file.name);
      showToast(`Сохранено фото в галерею: ${files.length}`);
      return;
    }
    if (await shareFiles(files)) return;
    if (files.length === 1) {
      await triggerDownload(files[0], files[0].name);
      showToast('Отправка недоступна — фотография скачана');
      return;
    }
    await downloadZip();
    showToast('Отправка недоступна — выбранные фото скачаны в ZIP');
  });
}

elements.saveSelectedBtn.addEventListener('click', () => {
  saveSelectedToGallery().catch((error) => {
    if (error.name !== 'AbortError') showError(`Не удалось сохранить фотографии: ${error.message}`);
  });
});

elements.shareBundleBtn.addEventListener('click', () => {
  withButtonProgress(elements.shareBundleBtn, 'Подготавливаем отправку…', async () => {
    const files = await getSelectedFiles();
    const text = elements.postPanel.hidden ? '' : elements.postText.value;
    if (await shareFiles(files, text)) return;
    if (text) await copyText(text);
    await downloadZip();
    showToast(text ? 'Текст скопирован, фотографии скачаны в ZIP' : 'Фотографии скачаны в ZIP');
  }).catch((error) => {
    if (error.name !== 'AbortError') showError(`Не удалось поделиться: ${error.message}`);
  });
});

async function downloadZip() {
  const files = await getSelectedFiles();
  const blob = await buildZip(files);
  await triggerDownload(blob, `${state.car?.brand || 'car'}-${state.car?.model || 'photos'}.zip`);
}

elements.zipBtn.addEventListener('click', () => {
  withButtonProgress(elements.zipBtn, 'Создаём ZIP…', downloadZip)
    .catch((error) => showError(error.message));
});

async function triggerDownload(blob, filename) {
  const safeFilename = filename.replace(/[^a-zA-Z0-9._-]+/g, '-');
  if (hasAndroidGalleryBridge()) {
    const downloadId = window.PlateMaskerAndroid.startDownload(
      safeFilename,
      blob.type || 'application/octet-stream',
    );
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const chunkSize = 49152;
    for (let offset = 0; offset < bytes.length; offset += chunkSize) {
      const chunk = bytes.subarray(offset, Math.min(offset + chunkSize, bytes.length));
      let binary = '';
      for (let part = 0; part < chunk.length; part += 8192) {
        binary += String.fromCharCode(...chunk.subarray(part, Math.min(part + 8192, chunk.length)));
      }
      window.PlateMaskerAndroid.appendDownloadChunk(downloadId, btoa(binary));
      if (offset > 0 && offset % (chunkSize * 16) === 0) await new Promise((resolve) => setTimeout(resolve));
    }
    window.PlateMaskerAndroid.finishDownload(downloadId);
    return;
  }
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = safeFilename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function saveOneImage(filename, button) {
  try {
    await withButtonProgress(button, '…', async () => {
      const file = await getImageFile(filename);
      await triggerDownload(file, filename);
      showToast('Фотография скачана');
    });
  } catch (error) {
    if (error.name !== 'AbortError') showError(error.message);
  }
}

async function reprocessImage(filename, button, status) {
  await withButtonProgress(button, '…', async () => {
    const image = state.images.find((item) => item.filename === filename);
    const response = await fetch('/api/process-image', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sourceUrl: image?.sourceUrl, watermark: getWatermarkOptions() }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Не удалось найти госномер');
    image.dataUrl = data.dataUrl;
    image.platesFound = data.platesFound;
    refreshPhoto(filename);
    state.fileCache.delete(filename);
    status.className = `photo-status ${data.platesFound ? '' : 'review'}`.trim();
    status.textContent = data.platesFound ? 'Номер скрыт' : 'Проверить номер';
    showToast(data.platesFound ? 'Маска госномера обновлена' : 'Номер не найден — скройте его вручную');
  }).catch((error) => showError(error.message));
}

function refreshPhoto(filename) {
  const card = [...elements.photoGrid.querySelectorAll('.photo-card')]
    .find((item) => item.dataset.filename === filename);
  if (card) card.querySelector('img').src = imageUrl(filename);
}

const editorContext = elements.editorCanvas.getContext('2d');

function openEditor(filename) {
  state.editorFilename = filename;
  state.editorRects = [];
  state.drawStart = null;
  const image = new Image();
  image.onload = () => {
    state.editorImage = image;
    const maxWidth = Math.min(900, window.innerWidth - 56);
    const maxHeight = Math.max(260, window.innerHeight - 230);
    const scale = Math.min(1, maxWidth / image.naturalWidth, maxHeight / image.naturalHeight);
    elements.editorCanvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    elements.editorCanvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    drawEditor();
    elements.editorModal.hidden = false;
    document.body.style.overflow = 'hidden';
  };
  image.onerror = () => showError('Не удалось загрузить оригинал фотографии для редактирования.');
  image.src = imageUrl(filename);
}

function closeEditor() {
  elements.editorModal.hidden = true;
  document.body.style.overflow = '';
  state.editorImage = null;
  state.editorRects = [];
  state.drawStart = null;
}

function drawEditor(preview = null) {
  if (!state.editorImage) return;
  const canvas = elements.editorCanvas;
  editorContext.clearRect(0, 0, canvas.width, canvas.height);
  editorContext.drawImage(state.editorImage, 0, 0, canvas.width, canvas.height);
  for (const rect of state.editorRects) drawMaskRect(rect, true);
  if (preview) drawMaskRect(preview, false);
}

function drawMaskRect(rect, filled) {
  const width = rect.x1 - rect.x0;
  const height = rect.y1 - rect.y0;
  if (filled) {
    editorContext.fillStyle = 'white';
    editorContext.fillRect(rect.x0, rect.y0, width, height);
  }
  editorContext.save();
  editorContext.strokeStyle = '#ff304f';
  editorContext.lineWidth = 2;
  if (!filled) editorContext.setLineDash([6, 4]);
  editorContext.strokeRect(rect.x0, rect.y0, width, height);
  editorContext.restore();
}

function canvasPoint(event) {
  const bounds = elements.editorCanvas.getBoundingClientRect();
  return {
    x: Math.max(0, Math.min(elements.editorCanvas.width, (event.clientX - bounds.left) * elements.editorCanvas.width / bounds.width)),
    y: Math.max(0, Math.min(elements.editorCanvas.height, (event.clientY - bounds.top) * elements.editorCanvas.height / bounds.height)),
  };
}

elements.editorCanvas.addEventListener('pointerdown', (event) => {
  event.preventDefault();
  elements.editorCanvas.setPointerCapture(event.pointerId);
  state.drawStart = canvasPoint(event);
});
elements.editorCanvas.addEventListener('pointermove', (event) => {
  if (!state.drawStart) return;
  event.preventDefault();
  const point = canvasPoint(event);
  drawEditor(normalizeRect(state.drawStart, point));
});
elements.editorCanvas.addEventListener('pointerup', (event) => {
  if (!state.drawStart) return;
  event.preventDefault();
  const rect = normalizeRect(state.drawStart, canvasPoint(event));
  if (rect.x1 - rect.x0 > 5 && rect.y1 - rect.y0 > 5) state.editorRects.push(rect);
  state.drawStart = null;
  drawEditor();
});
elements.editorCanvas.addEventListener('pointercancel', () => {
  state.drawStart = null;
  drawEditor();
});

function normalizeRect(first, second) {
  return {
    x0: Math.min(first.x, second.x),
    y0: Math.min(first.y, second.y),
    x1: Math.max(first.x, second.x),
    y1: Math.max(first.y, second.y),
  };
}

$('#editorCloseBtn').addEventListener('click', closeEditor);
$('#editorUndoBtn').addEventListener('click', () => { state.editorRects.pop(); drawEditor(); });
$('#editorClearBtn').addEventListener('click', () => { state.editorRects = []; drawEditor(); });
elements.editorModal.addEventListener('click', (event) => { if (event.target === elements.editorModal) closeEditor(); });

elements.editorApplyBtn.addEventListener('click', async () => {
  if (!state.editorRects.length) {
    showToast('Сначала нарисуйте прямоугольник поверх госномера');
    return;
  }
  await withButtonProgress(elements.editorApplyBtn, 'Применяем…', async () => {
    const scaleX = state.editorImage.naturalWidth / elements.editorCanvas.width;
    const scaleY = state.editorImage.naturalHeight / elements.editorCanvas.height;
    const rectangles = state.editorRects.map((rect) => ({
      x0: Math.round(rect.x0 * scaleX),
      y0: Math.round(rect.y0 * scaleY),
      x1: Math.round(rect.x1 * scaleX),
      y1: Math.round(rect.y1 * scaleY),
    }));
    const image = state.images.find((item) => item.filename === state.editorFilename);
    const response = await fetch('/api/process-image', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sourceUrl: image?.sourceUrl,
        rectangles,
        watermark: getWatermarkOptions(),
      }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Не удалось применить маску');
    image.dataUrl = data.dataUrl;
    image.platesFound = data.platesFound;
    const card = [...elements.photoGrid.querySelectorAll('.photo-card')]
      .find((item) => item.dataset.filename === state.editorFilename);
    if (card) {
      const status = card.querySelector('.photo-status');
      status.className = 'photo-status';
      status.textContent = 'Скрыто вручную';
    }
    state.fileCache.delete(state.editorFilename);
    refreshPhoto(state.editorFilename);
    closeEditor();
    showToast('Маска госномера применена вручную');
  }).catch((error) => showError(error.message));
});

elements.processBtn.addEventListener('click', processListing);
