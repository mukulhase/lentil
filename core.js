export const CARD_LONG_EDGE_MM = 85.6;
export const CARD_SHORT_EDGE_MM = 53.98;

export function roundTo(value, places = 2) {
  const factor = 10 ** places;
  return Math.round((Number(value) + Number.EPSILON) * factor) / factor;
}

export function screenPpi(cssPixelsPerMm, devicePixelRatio = 1) {
  return cssPixelsPerMm * devicePixelRatio * 25.4;
}

export function pixelsPerLens(ppi, lpi) {
  if (!(ppi > 0) || !(lpi > 0)) return 0;
  return ppi / lpi;
}

export function pitchCandidates(center, percentSpan, count = 7) {
  const midpoint = Number(center);
  const span = Number(percentSpan) / 100;
  if (!(midpoint > 0) || !(span > 0) || count < 2) return [];
  return Array.from({ length: count }, (_, index) => {
    const offset = -span + (2 * span * index) / (count - 1);
    return roundTo(midpoint * (1 + offset), 2);
  });
}

export function printerCandidates(center, step, count = 13) {
  const half = Math.floor(count / 2);
  return Array.from({ length: count }, (_, index) => roundTo(Number(center) + (index - half) * Number(step), 2));
}

export function outputGeometry(widthMm, heightMm, ppi) {
  return {
    width: Math.round((Number(widthMm) / 25.4) * Number(ppi)),
    height: Math.round((Number(heightMm) / 25.4) * Number(ppi)),
  };
}

export function viewForColumn(column, pixelsPerLenticule, phase = 0, reverse = false, views = 2) {
  const normalized = ((((column / pixelsPerLenticule) + phase) % 1) + 1) % 1;
  let view = Math.min(views - 1, Math.floor(normalized * views));
  if (reverse) view = views - 1 - view;
  return view;
}

function xmlEscape(value) {
  return String(value).replace(/[<>&"']/g, character => ({
    '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;',
  })[character]);
}

export function makePitchTestSvg({ center, step, paper = 'letter', count = 13 }) {
  const dimensions = paper === 'a4' ? [210, 297] : [215.9, 279.4];
  const [pageWidth, pageHeight] = dimensions;
  const candidates = printerCandidates(center, step, count);
  const margin = 14;
  const labelWidth = 25;
  const patternX = margin + labelWidth;
  const patternWidth = pageWidth - patternX - margin;
  const headingHeight = 38;
  const footerHeight = 30;
  const rowHeight = Math.min(13, (pageHeight - headingHeight - footerHeight - margin * 2) / count);
  const rowStart = margin + headingHeight;
  const patterns = candidates.map((lpi, index) => {
    const pitchMm = 25.4 / lpi;
    return `<pattern id="p${index}" patternUnits="userSpaceOnUse" width="${pitchMm}" height="${rowHeight}"><rect width="${pitchMm / 2}" height="${rowHeight}" fill="#000"/></pattern>`;
  }).join('');
  const rows = candidates.map((lpi, index) => {
    const y = rowStart + index * rowHeight;
    const label = `${String.fromCharCode(65 + index)}  ${lpi.toFixed(2)}`;
    return `<text x="${margin}" y="${y + rowHeight * .68}" class="label">${xmlEscape(label)}</text><rect x="${patternX}" y="${y}" width="${patternWidth}" height="${rowHeight - .7}" fill="#fff"/><rect x="${patternX}" y="${y}" width="${patternWidth}" height="${rowHeight - .7}" fill="url(#p${index})"/>`;
  }).join('');
  const scaleY = pageHeight - margin - 12;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${pageWidth}mm" height="${pageHeight}mm" viewBox="0 0 ${pageWidth} ${pageHeight}">
  <defs>${patterns}<style>.title{font:700 6px sans-serif;fill:#17211d}.copy{font:3.2px sans-serif;fill:#5f6863}.label{font:700 3.5px monospace;fill:#17211d}</style></defs>
  <rect width="100%" height="100%" fill="#fff"/>
  <text x="${margin}" y="${margin + 4}" class="title">Lentil printer pitch test</text>
  <text x="${margin}" y="${margin + 11}" class="copy">Center ${Number(center).toFixed(2)} LPI · ${Number(step).toFixed(2)} increments · ${count} bands</text>
  <text x="${margin}" y="${margin + 17}" class="copy">Print at 100% / Actual size. Disable Fit, Shrink, and borderless expansion.</text>
  <text x="${margin}" y="${margin + 23}" class="copy">Smooth side against print, ridges outward. Align lenticules parallel to stripes; tilt left ↔ right.</text>
  ${rows}
  <line x1="${margin}" y1="${scaleY}" x2="${margin + 100}" y2="${scaleY}" stroke="#17211d" stroke-width=".35"/>
  <line x1="${margin}" y1="${scaleY - 2}" x2="${margin}" y2="${scaleY + 2}" stroke="#17211d" stroke-width=".35"/>
  <line x1="${margin + 100}" y1="${scaleY - 2}" x2="${margin + 100}" y2="${scaleY + 2}" stroke="#17211d" stroke-width=".35"/>
  <text x="${margin}" y="${scaleY + 6}" class="label">100 mm scaling check — measure before judging bands</text>
</svg>`;
}

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function uint32(value) {
  return new Uint8Array([(value >>> 24) & 255, (value >>> 16) & 255, (value >>> 8) & 255, value & 255]);
}

export function addPngDensity(arrayBuffer, ppi) {
  const png = new Uint8Array(arrayBuffer);
  const signature = png.slice(0, 8);
  const ihdrLength = 25;
  const pixelsPerMeter = Math.round(Number(ppi) / 0.0254);
  const type = new TextEncoder().encode('pHYs');
  const data = new Uint8Array(9);
  data.set(uint32(pixelsPerMeter), 0);
  data.set(uint32(pixelsPerMeter), 4);
  data[8] = 1;
  const crcInput = new Uint8Array(type.length + data.length);
  crcInput.set(type);
  crcInput.set(data, type.length);
  const chunk = new Uint8Array(4 + 4 + 9 + 4);
  chunk.set(uint32(9), 0);
  chunk.set(type, 4);
  chunk.set(data, 8);
  chunk.set(uint32(crc32(crcInput)), 17);
  const output = new Uint8Array(png.length + chunk.length);
  output.set(signature, 0);
  output.set(png.slice(8, ihdrLength + 8), 8);
  output.set(chunk, ihdrLength + 8);
  output.set(png.slice(ihdrLength + 8), ihdrLength + 8 + chunk.length);
  return output;
}
