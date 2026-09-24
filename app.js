import {
  CARD_LONG_EDGE_MM,
  CARD_SHORT_EDGE_MM,
  addPngDensity,
  makePitchTestSvg,
  outputGeometry,
  pitchCandidates,
  pixelsPerLens,
  printerCandidates,
  roundTo,
  screenPpi,
  viewForColumn,
} from './core.js?v=2';

const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const state = {
  cssPixelsPerMm: Number(localStorage.getItem('lentil.cssPixelsPerMm.longEdgeV1')) || 0,
  estimatedLpi: Number(localStorage.getItem('lentil.estimatedLpi')) || 0,
  workingLpi: Number(localStorage.getItem('lentil.workingLpi')) || 0,
  barLength: 0,
  sweepStage: 0,
  sweepCenter: 60,
  sweepSpan: 15,
  screenCandidates: [],
  printerCandidates: [],
  images: [null, null],
  lastPng: null,
  lastPngUrl: '',
  deferredInstall: null,
};

function toast(message) {
  const element = $('#toast');
  element.textContent = message;
  element.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => element.classList.remove('show'), 2600);
}

function saveNumber(key, value) {
  state[key] = Number(value);
  localStorage.setItem(`lentil.${key}`, String(value));
}

function calibratedPpi() {
  return screenPpi(state.cssPixelsPerMm, window.devicePixelRatio || 1);
}

function initializeCardBar() {
  const reference = Number($('#referenceLength').value) || CARD_LONG_EDGE_MM;
  const savedCssLength = state.cssPixelsPerMm ? state.cssPixelsPerMm * reference : 0;
  state.barLength = savedCssLength || Math.min(360, Math.max(window.innerWidth, window.innerHeight) * .48);
  renderCardBar();
}

function renderCardBar() {
  const cardAspect = CARD_SHORT_EDGE_MM / CARD_LONG_EDGE_MM;
  const portrait = window.innerHeight >= window.innerWidth;
  const availableWidth = $('.card-calibrator').clientWidth - 42;
  const availableHeight = window.innerHeight * .88;
  const maxLongEdge = portrait
    ? Math.min(720, availableHeight, availableWidth / cardAspect)
    : Math.min(900, availableWidth, availableHeight / cardAspect);
  state.barLength = Math.min(Math.max(180, maxLongEdge), Math.max(120, state.barLength));
  const card = $('#cardBar');
  card.classList.toggle('landscape', !portrait);
  card.style.height = `${portrait ? state.barLength : state.barLength * cardAspect}px`;
  card.style.width = `${portrait ? state.barLength * cardAspect : state.barLength}px`;
  card.setAttribute('aria-label', `${portrait ? 'Portrait' : 'Landscape'} bank card outline; match the ${CARD_LONG_EDGE_MM.toFixed(2)} millimetre long edge`);
  const reference = Number($('#referenceLength').value) || CARD_LONG_EDGE_MM;
  card.querySelector('b').textContent = `${reference.toFixed(2)} mm`;
  $('#cardInstructions').innerHTML = portrait
    ? `Place the card upright over the outline. Adjust until its <strong>top and bottom</strong> edges line up; the side edges are a cross-check.`
    : `Place the card sideways over the outline. Adjust until its <strong>left and right</strong> edges line up; the top and bottom edges are a cross-check.`;
  $('#screenScaleOutput').textContent = state.cssPixelsPerMm
    ? `${Math.round(calibratedPpi())} estimated PPI`
    : `${Math.round(state.barLength)} screen px along the long edge`;
}

function updateCapability() {
  const notice = $('#screenCapability');
  const openButton = $('#openPattern');
  if (!state.cssPixelsPerMm) {
    notice.className = 'notice';
    notice.textContent = 'Calibrate the screen to check its useful range.';
    openButton.disabled = true;
    return;
  }
  const lpi = Number($('#nominalLpi').value);
  const ppi = calibratedPpi();
  const ppl = pixelsPerLens(ppi, lpi);
  notice.className = `notice ${ppl >= 4 ? 'good' : ''}`;
  notice.textContent = ppl >= 4
    ? `About ${ppi.toFixed(0)} screen PPI gives ${ppl.toFixed(1)} pixels per lens at ${lpi} LPI — enough for a useful estimate.`
    : `Only ${ppl.toFixed(1)} pixels per lens at ${lpi} LPI. The screen test will be rough; use the broad printed test as the authority.`;
  openButton.disabled = false;
}

function drawPitchBands(candidates) {
  const canvas = $('#pitchCanvas');
  const dpr = window.devicePixelRatio || 1;
  const width = Math.round(window.innerWidth * dpr);
  const height = Math.round(window.innerHeight * dpr);
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d', { alpha: false });
  context.imageSmoothingEnabled = false;
  context.fillStyle = '#fff';
  context.fillRect(0, 0, width, height);
  const rowHeight = height / candidates.length;
  const physicalPpi = calibratedPpi();

  candidates.forEach((lpi, row) => {
    const top = Math.floor(row * rowHeight);
    const bottom = Math.ceil((row + 1) * rowHeight);
    const period = physicalPpi / lpi;
    context.fillStyle = '#050505';
    for (let x = 0; x < width; x += 1) {
      if ((x % period) < period / 2) context.fillRect(x, top, 1, bottom - top);
    }
    context.fillStyle = 'rgba(238,112,75,.94)';
    context.beginPath();
    context.arc(23 * dpr, (top + bottom) / 2, 14 * dpr, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = '#fff';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.font = `900 ${15 * dpr}px system-ui`;
    context.fillText(String.fromCharCode(65 + row), 23 * dpr, (top + bottom) / 2);
  });
}

function populateBandPicker(candidates) {
  const picker = $('#bandPicker');
  picker.replaceChildren(...candidates.map((lpi, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = String.fromCharCode(65 + index);
    button.title = `${lpi.toFixed(2)} LPI`;
    button.addEventListener('click', () => chooseScreenBand(index));
    return button;
  }));
}

async function openPattern() {
  state.sweepStage = 0;
  state.sweepCenter = Number($('#nominalLpi').value);
  state.sweepSpan = Number($('#searchWidth').value) / 2;
  renderSweep();
  $('#patternOverlay').hidden = false;
  document.body.style.overflow = 'hidden';
  try {
    if (document.documentElement.requestFullscreen) await document.documentElement.requestFullscreen();
    if (screen.orientation?.lock) await screen.orientation.lock('portrait').catch(() => {});
  } catch { /* Fullscreen is an enhancement. */ }
}

function renderSweep() {
  state.screenCandidates = pitchCandidates(state.sweepCenter, state.sweepSpan);
  drawPitchBands(state.screenCandidates);
  populateBandPicker(state.screenCandidates);
  $('.pattern-topbar strong').textContent = state.sweepStage === 0 ? 'Round 1 · choose the calmest band' : `Round ${state.sweepStage + 1} · compare again`;
}

function chooseScreenBand(index) {
  const selected = state.screenCandidates[index];
  if (state.sweepStage < 2) {
    state.sweepStage += 1;
    state.sweepCenter = selected;
    state.sweepSpan = state.sweepStage === 1 ? 2 : .4;
    renderSweep();
    toast('Good — the range is now narrower');
    return;
  }
  saveNumber('estimatedLpi', selected);
  $('#estimatedLpi').textContent = selected.toFixed(2);
  $('#estimatePrecision').textContent = `Screen estimate at about ${calibratedPpi().toFixed(0)} PPI. Confirm it on paper.`;
  $('#sheetResult').hidden = false;
  $('#printCenterLpi').value = selected.toFixed(2);
  updatePrinterBands();
  closePattern();
  $('#print-test').scrollIntoView({ behavior: 'smooth' });
}

function closePattern() {
  $('#patternOverlay').hidden = true;
  document.body.style.overflow = '';
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  if (screen.orientation?.unlock) screen.orientation.unlock();
}

function updatePrinterBands() {
  const center = Number($('#printCenterLpi').value);
  const step = Number($('#printStep').value);
  state.printerCandidates = printerCandidates(center, step);
  const select = $('#winningBand');
  select.replaceChildren(...state.printerCandidates.map((lpi, index) => {
    const option = document.createElement('option');
    option.value = String(lpi);
    option.textContent = `${String.fromCharCode(65 + index)} · ${lpi.toFixed(2)} LPI`;
    if (index === 6) option.selected = true;
    return option;
  }));
}

function pitchTestSvg() {
  return makePitchTestSvg({
    center: Number($('#printCenterLpi').value),
    step: Number($('#printStep').value),
    paper: $('#paperSize').value,
  });
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

function downloadPitchTest() {
  const center = Number($('#printCenterLpi').value).toFixed(2);
  downloadBlob(new Blob([pitchTestSvg()], { type: 'image/svg+xml' }), `lentil-pitch-test-${center}.svg`);
  toast('Printable test downloaded');
}

function openPitchTest() {
  const url = URL.createObjectURL(new Blob([pitchTestSvg()], { type: 'image/svg+xml' }));
  window.open(url, '_blank', 'noopener');
  setTimeout(() => URL.revokeObjectURL(url), 120_000);
}

async function readImage(file) {
  if ('createImageBitmap' in window) return createImageBitmap(file);
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    return image;
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function handleImage(index, input, label) {
  const file = input.files?.[0];
  if (!file) return;
  try {
    state.images[index] = await readImage(file);
    label.textContent = file.name;
    updateOutputBudget();
  } catch {
    toast('That image could not be opened');
  }
}

function activeLpi() {
  return state.workingLpi || Number($('#printCenterLpi').value) || state.estimatedLpi;
}

function updateOutputBudget() {
  const geometry = outputGeometry($('#outputWidth').value, $('#outputHeight').value, $('#outputPpi').value);
  const lpi = activeLpi();
  const perLens = pixelsPerLens(Number($('#outputPpi').value), lpi);
  const perView = perLens / 2;
  const megapixels = (geometry.width * geometry.height) / 1_000_000;
  const ready = state.images.every(Boolean) && lpi > 0 && megapixels <= 32;
  const budget = $('#outputBudget');
  budget.className = `notice ${perView >= 2 && megapixels <= 32 ? 'good' : ''}`;
  if (megapixels > 32) {
    budget.textContent = `${geometry.width} × ${geometry.height}px is ${megapixels.toFixed(1)} MP, above the mobile-safe 32 MP limit. Reduce size or resolution.`;
  } else {
    budget.textContent = `${geometry.width} × ${geometry.height}px · ${perLens.toFixed(2)} pixels/lens · ${perView.toFixed(2)} pixels/view${perView < 2 ? ' — resolution is marginal' : ''}.`;
  }
  $('#buildInterlace').disabled = !ready;
}

function drawCover(context, image, width, height) {
  const scale = Math.max(width / image.width, height / image.height);
  const sourceWidth = width / scale;
  const sourceHeight = height / scale;
  const sourceX = (image.width - sourceWidth) / 2;
  const sourceY = (image.height - sourceHeight) / 2;
  context.drawImage(image, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, width, height);
}

function yieldToBrowser() {
  return new Promise(resolve => setTimeout(resolve, 0));
}

async function buildInterlace() {
  const button = $('#buildInterlace');
  button.disabled = true;
  const progress = $('#renderProgress');
  const progressBar = progress.querySelector('span');
  const progressText = progress.querySelector('output');
  progress.hidden = false;
  $('#downloadArea').hidden = true;
  state.lastPng = null;
  const ppi = Number($('#outputPpi').value);
  const lpi = activeLpi();
  const geometry = outputGeometry($('#outputWidth').value, $('#outputHeight').value, ppi);
  const sources = state.images.map(image => {
    const canvas = document.createElement('canvas');
    canvas.width = geometry.width;
    canvas.height = geometry.height;
    drawCover(canvas.getContext('2d', { alpha: false }), image, geometry.width, geometry.height);
    return canvas;
  });
  const output = $('#outputCanvas');
  output.width = geometry.width;
  output.height = geometry.height;
  const context = output.getContext('2d', { alpha: false });
  context.imageSmoothingEnabled = false;
  const ppl = ppi / lpi;
  const phase = Number($('#lensPhase').value);
  const reverse = $('#reverseViews').checked;

  for (let start = 0; start < geometry.width; start += 256) {
    const end = Math.min(geometry.width, start + 256);
    for (let x = start; x < end; x += 1) {
      const source = sources[viewForColumn(x, ppl, phase, reverse)];
      context.drawImage(source, x, 0, 1, geometry.height, x, 0, 1, geometry.height);
    }
    const percent = Math.round((end / geometry.width) * 90);
    progressBar.style.width = `${percent}%`;
    progressText.textContent = `Interlacing · ${percent}%`;
    await yieldToBrowser();
  }

  progressText.textContent = 'Encoding print metadata…';
  const rawBlob = await new Promise(resolve => output.toBlob(resolve, 'image/png'));
  state.lastPng = new Blob([addPngDensity(await rawBlob.arrayBuffer(), ppi)], { type: 'image/png' });
  if (state.lastPngUrl) URL.revokeObjectURL(state.lastPngUrl);
  state.lastPngUrl = URL.createObjectURL(state.lastPng);
  progressBar.style.width = '100%';
  progressText.textContent = 'Ready';
  $('#downloadArea').hidden = false;
  button.disabled = false;
  toast('Interlaced image is ready');
}

function downloadPng() {
  if (!state.lastPng) return;
  downloadBlob(state.lastPng, `lentil-flip-${activeLpi().toFixed(2)}lpi-${$('#outputPpi').value}ppi.png`);
}

async function downloadWrappedSvg() {
  if (!state.lastPng) return;
  const dataUrl = await new Promise(resolve => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.readAsDataURL(state.lastPng);
  });
  const width = Number($('#outputWidth').value);
  const height = Number($('#outputHeight').value);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}mm" height="${height}mm" viewBox="0 0 ${width} ${height}"><image width="${width}" height="${height}" href="${dataUrl}" preserveAspectRatio="none"/></svg>`;
  downloadBlob(new Blob([svg], { type: 'image/svg+xml' }), `lentil-flip-${width}x${height}mm.svg`);
}

function restoreState() {
  if (state.estimatedLpi) {
    $('#estimatedLpi').textContent = state.estimatedLpi.toFixed(2);
    $('#estimatePrecision').textContent = 'Restored screen estimate. Confirm it on paper.';
    $('#sheetResult').hidden = false;
    $('#printCenterLpi').value = state.estimatedLpi.toFixed(2);
  }
  if (state.workingLpi) {
    $('#workingLpi').textContent = state.workingLpi.toFixed(2);
    $('#printerResult').hidden = false;
    $('#printCenterLpi').value = state.workingLpi.toFixed(2);
  }
}

function resetApp() {
  ['cssPixelsPerMm', 'cssPixelsPerMm.heightV1', 'cssPixelsPerMm.longEdgeV1', 'estimatedLpi', 'workingLpi'].forEach(key => localStorage.removeItem(`lentil.${key}`));
  location.reload();
}

$$('.nudge').forEach(button => button.addEventListener('click', () => {
  state.barLength += Number(button.dataset.nudge);
  state.cssPixelsPerMm = 0;
  renderCardBar();
}));
$('#referenceLength').addEventListener('input', renderCardBar);
$('#saveScreenScale').addEventListener('click', () => {
  const portrait = window.innerHeight >= window.innerWidth;
  const physicalLength = Number($('#referenceLength').value);
  const bounds = $('#cardBar').getBoundingClientRect();
  const renderedLength = portrait ? bounds.height : bounds.width;
  state.cssPixelsPerMm = renderedLength / physicalLength;
  localStorage.setItem('lentil.cssPixelsPerMm.longEdgeV1', String(state.cssPixelsPerMm));
  renderCardBar();
  updateCapability();
  toast(`Screen scale saved · about ${calibratedPpi().toFixed(0)} PPI`);
  $('#sheet-test').scrollIntoView({ behavior: 'smooth' });
});
['nominalLpi', 'searchWidth'].forEach(id => $(`#${id}`).addEventListener('input', updateCapability));
$('#openPattern').addEventListener('click', openPattern);
$('#closePattern').addEventListener('click', closePattern);
window.addEventListener('resize', () => {
  renderCardBar();
  if (!$('#patternOverlay').hidden && state.screenCandidates.length) drawPitchBands(state.screenCandidates);
});
['printCenterLpi', 'printStep'].forEach(id => $(`#${id}`).addEventListener('input', updatePrinterBands));
$('#downloadPrintTest').addEventListener('click', downloadPitchTest);
$('#openPrintTest').addEventListener('click', openPitchTest);
$('#acceptPrintedPitch').addEventListener('click', () => {
  const pitch = Number($('#winningBand').value);
  saveNumber('workingLpi', pitch);
  $('#workingLpi').textContent = pitch.toFixed(2);
  $('#printerResult').hidden = false;
  updateOutputBudget();
  toast('Working pitch saved');
  $('#interlacer').scrollIntoView({ behavior: 'smooth' });
});
$('#imageA').addEventListener('change', event => handleImage(0, event.target, $('#imageAName')));
$('#imageB').addEventListener('change', event => handleImage(1, event.target, $('#imageBName')));
['outputWidth', 'outputHeight', 'outputPpi'].forEach(id => $(`#${id}`).addEventListener('input', updateOutputBudget));
$('#buildInterlace').addEventListener('click', buildInterlace);
$('#downloadPng').addEventListener('click', downloadPng);
$('#downloadWrappedSvg').addEventListener('click', downloadWrappedSvg);
$('#resetApp').addEventListener('click', resetApp);

window.addEventListener('beforeinstallprompt', event => {
  event.preventDefault();
  state.deferredInstall = event;
  $('#installButton').hidden = false;
});
$('#installButton').addEventListener('click', async () => {
  if (!state.deferredInstall) return;
  state.deferredInstall.prompt();
  await state.deferredInstall.userChoice;
  state.deferredInstall = null;
  $('#installButton').hidden = true;
});

if ('serviceWorker' in navigator) navigator.serviceWorker.register('./service-worker.js');
initializeCardBar();
restoreState();
updateCapability();
updatePrinterBands();
updateOutputBudget();
