"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { detectSubtitleRegion } = require("../src/detector.js");

function frame(width, height, withText) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < data.length; i += 4) data[i + 3] = 255;
  if (withText) {
    for (let y = 65; y < 76; y++) for (let x = 22; x < 98; x++) {
      const white = ((x >> 1) + y) % 2 === 0;
      const i = (y * width + x) * 4;
      data[i] = data[i + 1] = data[i + 2] = white ? 255 : 0;
    }
  }
  return data;
}

test("finds a high-contrast subtitle band", () => {
  const result = detectSubtitleRegion([frame(120, 100, true), frame(120, 100, true)], 120, 100);
  assert.ok(result);
  assert.ok(result.y > 0.5 && result.y < 0.8);
  assert.ok(result.width > 0.4);
});

test("returns null for a featureless video", () => {
  assert.equal(detectSubtitleRegion([frame(120, 100, false)], 120, 100), null);
});

test("returns null without frames", () => {
  assert.equal(detectSubtitleRegion([], 120, 100), null);
});
