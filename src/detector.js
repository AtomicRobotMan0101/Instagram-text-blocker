(function (root, factory) {
  const api = factory();
  root.SubtitleDetector = api;
  if (typeof module === "object" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function luminance(data, index) {
    return (data[index] * 77 + data[index + 1] * 150 + data[index + 2] * 29) >> 8;
  }

  function detectSubtitleRegion(frames, width, height, options = {}) {
    if (!frames.length || width < 8 || height < 8) return null;
    const contrastThreshold = options.contrastThreshold || 90;
    const minY = Math.floor(height * 0.08);
    const maxY = Math.floor(height * 0.93);
    const rowScores = new Float64Array(height);

    for (const frame of frames) {
      for (let y = minY; y < maxY; y += 2) {
        let edges = 0;
        for (let x = 2; x < width - 2; x += 2) {
          const i = (y * width + x) * 4;
          const lr = Math.abs(luminance(frame, i - 8) - luminance(frame, i + 8));
          const ud = Math.abs(luminance(frame, i - width * 8) - luminance(frame, i + width * 8));
          if (lr + ud >= contrastThreshold) edges++;
        }
        rowScores[y] += edges / (width / 2);
      }
    }

    for (let y = 0; y < height; y++) rowScores[y] /= frames.length;
    let peakY = -1;
    let peak = 0;
    for (let y = minY; y < maxY; y += 2) {
      const weighted = rowScores[y] * (0.8 + y / height * 0.35);
      if (weighted > peak) { peak = weighted; peakY = y; }
    }
    if (peakY < 0 || peak < (options.minEdgeDensity || 0.035)) return null;

    const cutoff = Math.max(0.018, rowScores[peakY] * 0.28);
    let top = peakY;
    let bottom = peakY;
    let quiet = 0;
    for (let y = peakY; y >= minY; y -= 2) {
      if (rowScores[y] >= cutoff) { top = y; quiet = 0; }
      else if (++quiet >= 3) break;
    }
    quiet = 0;
    for (let y = peakY; y < maxY; y += 2) {
      if (rowScores[y] >= cutoff) { bottom = y; quiet = 0; }
      else if (++quiet >= 3) break;
    }

    const colScores = new Float64Array(width);
    for (const frame of frames) {
      for (let x = 2; x < width - 2; x += 2) {
        let edges = 0;
        for (let y = top; y <= bottom; y += 2) {
          const i = (y * width + x) * 4;
          if (Math.abs(luminance(frame, i - 8) - luminance(frame, i + 8)) >= contrastThreshold / 2) edges++;
        }
        colScores[x] += edges;
      }
    }
    const colPeak = Math.max(...colScores);
    const colCutoff = Math.max(1, colPeak * 0.18);
    let left = width;
    let right = 0;
    for (let x = 2; x < width - 2; x += 2) {
      if (colScores[x] >= colCutoff) { left = Math.min(left, x); right = Math.max(right, x); }
    }
    if (right <= left) { left = width * 0.15; right = width * 0.85; }

    return {
      x: left / width,
      y: top / height,
      width: (right - left) / width,
      height: Math.max(8, bottom - top + 2) / height,
      confidence: Math.min(1, peak / 0.12)
    };
  }

  return { detectSubtitleRegion };
});
