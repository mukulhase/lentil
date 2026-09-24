import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CARD_LONG_EDGE_MM,
  CARD_SHORT_EDGE_MM,
  addPngDensity,
  makePitchTestSvg,
  outputGeometry,
  pitchCandidates,
  printerCandidates,
  screenPpi,
  viewForColumn,
} from './core.js';

test('portrait card reference uses the longer edge vertically', () => {
  assert.equal(CARD_LONG_EDGE_MM, 85.6);
  assert.equal(CARD_SHORT_EDGE_MM, 53.98);
  assert.ok(CARD_SHORT_EDGE_MM / CARD_LONG_EDGE_MM < 1);
});

test('screen calibration converts CSS scale and DPR to physical PPI', () => {
  assert.ok(Math.abs(screenPpi(460 / 25.4 / 3, 3) - 460) < 1e-9);
});

test('screen candidates are centered and symmetric', () => {
  assert.deepEqual(pitchCandidates(60, 15), [51, 54, 57, 60, 63, 66, 69]);
});

test('printer candidates use exact increments', () => {
  assert.deepEqual(printerCandidates(50, .1, 5), [49.8, 49.9, 50, 50.1, 50.2]);
});

test('output dimensions preserve physical size', () => {
  assert.deepEqual(outputGeometry(101.6, 152.4, 720), { width: 2880, height: 4320 });
});

test('columns alternate source views within each lenticule', () => {
  assert.deepEqual([0, 1, 2, 3].map(x => viewForColumn(x, 4)), [0, 0, 1, 1]);
  assert.deepEqual([0, 1, 2, 3].map(x => viewForColumn(x, 4, 0, true)), [1, 1, 0, 0]);
});

test('pitch sheet has physical page and scale dimensions', () => {
  const svg = makePitchTestSvg({ center: 60, step: .1, paper: 'a4' });
  assert.match(svg, /width="210mm" height="297mm"/);
  assert.match(svg, /100 mm scaling check/);
  assert.match(svg, /60\.00/);
});

test('PNG density metadata is inserted after IHDR', () => {
  const minimal = new Uint8Array(40);
  minimal.set([137, 80, 78, 71, 13, 10, 26, 10]);
  minimal.set([0, 0, 0, 13, 73, 72, 68, 82], 8);
  const result = addPngDensity(minimal.buffer, 720);
  assert.equal(result.length, minimal.length + 21);
  assert.equal(new TextDecoder().decode(result.slice(37, 41)), 'pHYs');
});
