"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { detectSubtitleRegion, detectSubtitleRegions } = require("../src/detector.js");

function frame(width, height, bands = []) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < data.length; i += 4) data[i + 3] = 255;
  for (const [left, top, right, bottom] of bands) {
    for (let y = top; y < bottom; y++) for (let x = left; x < right; x++) {
      // Repeated vertical and horizontal strokes approximate outlined glyphs.
      const white = (x - left) % 6 < 2 || (y - top) % 5 === 0;
      const i = (y * width + x) * 4;
      data[i] = data[i + 1] = data[i + 2] = white ? 255 : 0;
    }
  }
  return data;
}

test("finds a high-contrast subtitle band", () => {
  const result = detectSubtitleRegion([frame(120, 100, [[22, 65, 98, 76]]), frame(120, 100, [[22, 65, 98, 76]])], 120, 100);
  assert.ok(result);
  assert.ok(result.y > 0.5 && result.y < 0.8);
  assert.ok(result.width > 0.4);
});

test("returns null for a featureless video", () => {
  assert.equal(detectSubtitleRegion([frame(120, 100)], 120, 100), null);
});

test("returns null without frames", () => {
  assert.equal(detectSubtitleRegion([], 120, 100), null);
});

test("finds simultaneous top title and bottom captions", () => {
  const frames = Array.from({ length: 8 }, () => frame(160, 120, [
    [24, 10, 136, 24],
    [38, 92, 122, 103]
  ]));
  const regions = detectSubtitleRegions(frames, 160, 120);
  assert.equal(regions.length, 2);
  assert.ok(regions[0].y < 0.25);
  assert.ok(regions[1].y > 0.65);
});

test("retains a caption that appears after an initially blank frame", () => {
  const frames = [frame(160, 120)];
  for (let i = 0; i < 7; i++) frames.push(frame(160, 120, [[30, 88, 130, 101]]));
  const regions = detectSubtitleRegions(frames, 160, 120);
  assert.equal(regions.length, 1);
  assert.ok(regions[0].y > 0.65);
});

test("limits automatic masks to the requested count", () => {
  const bands = [[20, 8, 140, 18], [25, 48, 135, 59], [30, 91, 130, 102]];
  const frames = Array.from({ length: 6 }, () => frame(160, 120, bands));
  assert.equal(detectSubtitleRegions(frames, 160, 120, { maxRegions: 2 }).length, 2);
});
