(function (root, factory) {
  const api = factory();
  root.SubtitleDetector = api;
  if (typeof module === "object" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function luminance(data, index) {
    return (data[index] * 77 + data[index + 1] * 150 + data[index + 2] * 29) >> 8;
  }

  function rowDensity(frame, width, y, contrastThreshold) {
    let edges = 0;
    let samples = 0;
    for (let x = 2; x < width - 2; x += 2) {
      const i = (y * width + x) * 4;
      const lr = Math.abs(luminance(frame, i - 8) - luminance(frame, i + 8));
      const ud = Math.abs(luminance(frame, i - width * 8) - luminance(frame, i + width * 8));
      if (lr + ud >= contrastThreshold) edges++;
      samples++;
    }
    return samples ? edges / samples : 0;
  }

  function columnDensity(frame, width, height, x, contrastThreshold) {
    let edges = 0;
    let samples = 0;
    for (let y = 2; y < height - 2; y += 2) {
      const i = (y * width + x) * 4;
      const lr = Math.abs(luminance(frame, i - 8) - luminance(frame, i + 8));
      const ud = Math.abs(luminance(frame, i - width * 8) - luminance(frame, i + width * 8));
      if (lr + ud >= contrastThreshold) edges++;
      samples++;
    }
    return samples ? edges / samples : 0;
  }

  function smooth(values, radius) {
    const result = new Float64Array(values.length);
    for (let i = 0; i < values.length; i++) {
      let total = 0;
      let count = 0;
      for (let j = Math.max(0, i - radius); j <= Math.min(values.length - 1, i + radius); j++) {
        total += values[j];
        count++;
      }
      result[i] = total / count;
    }
    return result;
  }

  function zoneWeight(y, height) {
    const position = y / height;
    if (position >= 0.58) return 1.25; // speech captions
    if (position <= 0.30) return 1.08; // headlines and title cards
    return 0.92; // centre banners
  }

  function horizontalBounds(frames, width, top, bottom, contrastThreshold) {
    const scores = new Float64Array(width);
    for (const frame of frames) {
      for (let x = 2; x < width - 2; x += 2) {
        let edges = 0;
        for (let y = top; y <= bottom; y += 2) {
          const i = (y * width + x) * 4;
          const lr = Math.abs(luminance(frame, i - 8) - luminance(frame, i + 8));
          const ud = Math.abs(luminance(frame, i - width * 8) - luminance(frame, i + width * 8));
          if (lr + ud >= contrastThreshold * 0.65) edges++;
        }
        scores[x] += edges;
      }
    }
    const peak = Math.max(...scores);
    const cutoff = Math.max(1, peak * 0.16);
    let left = width;
    let right = 0;
    for (let x = 2; x < width - 2; x += 2) {
      if (scores[x] >= cutoff) {
        left = Math.min(left, x);
        right = Math.max(right, x);
      }
    }
    if (right <= left) return null;
    return { left, right };
  }

  function verticalBounds(frames, width, height, left, right, contrastThreshold) {
    const scores = new Float64Array(height);
    for (const frame of frames) {
      for (let y = 2; y < height - 2; y += 2) {
        let edges = 0;
        for (let x = left; x <= right; x += 2) {
          const i = (y * width + x) * 4;
          const lr = Math.abs(luminance(frame, i - 8) - luminance(frame, i + 8));
          const ud = Math.abs(luminance(frame, i - width * 8) - luminance(frame, i + width * 8));
          if (lr + ud >= contrastThreshold * 0.65) edges++;
        }
        scores[y] += edges;
      }
    }
    const peak = Math.max(...scores);
    const cutoff = Math.max(1, peak * 0.16);
    let top = height;
    let bottom = 0;
    for (let y = 2; y < height - 2; y += 2) {
      if (scores[y] >= cutoff) {
        top = Math.min(top, y);
        bottom = Math.max(bottom, y);
      }
    }
    if (bottom <= top) return null;
    return { top, bottom };
  }

  function verticalCandidates(frames, width, height, contrastThreshold, minEdgeDensity, minPersistence) {
    const average = new Float64Array(width);
    const persistence = new Float64Array(width);
    for (const frame of frames) {
      for (let x = 2; x < width - 2; x++) {
        const density = columnDensity(frame, width, height, x, contrastThreshold);
        average[x] += density;
        if (density >= minEdgeDensity * 0.72) persistence[x]++;
      }
    }
    for (let x = 2; x < width - 2; x++) {
      average[x] /= frames.length;
      persistence[x] /= frames.length;
    }
    const smoothed = smooth(average, 2);
    const active = (x) => smoothed[x] >= minEdgeDensity && persistence[x] >= minPersistence;
    const candidates = [];
    let x = 2;
    while (x < width - 2) {
      if (!active(x)) { x++; continue; }
      const left = x;
      let right = x;
      let quiet = 0;
      let peak = 0;
      let persistencePeak = 0;
      while (x < width - 2 && quiet < 4) {
        if (active(x)) {
          right = x;
          quiet = 0;
          peak = Math.max(peak, smoothed[x]);
          persistencePeak = Math.max(persistencePeak, persistence[x]);
        } else quiet++;
        x++;
      }
      const bandWidth = right - left + 2;
      if (bandWidth < width * 0.035 || bandWidth > width * 0.24) continue;
      const centreX = (left + right) / 2 / width;
      if (centreX > 0.24 && centreX < 0.76) continue;
      const bounds = verticalBounds(frames, width, height, left, right, contrastThreshold);
      if (!bounds) continue;
      const bandHeight = bounds.bottom - bounds.top;
      if (bandHeight < height * 0.16 || bandHeight < bandWidth * 1.5) continue;
      const score = peak * (0.6 + persistencePeak * 0.4);
      candidates.push({
        x: left / width,
        y: bounds.top / height,
        width: bandWidth / width,
        height: bandHeight / height,
        confidence: Math.min(1, score / 0.12),
        score,
        orientation: "vertical"
      });
    }
    return candidates;
  }

  function mergeNearby(regions, height) {
    const sorted = [...regions].sort((a, b) => a.y - b.y);
    const merged = [];
    for (const region of sorted) {
      const previous = merged[merged.length - 1];
      const gap = previous ? region.y - (previous.y + previous.height) : Infinity;
      if (previous && previous.orientation !== "vertical" && region.orientation !== "vertical" && gap < 0.025 && Math.min(previous.x + previous.width, region.x + region.width) > Math.max(previous.x, region.x)) {
        const right = Math.max(previous.x + previous.width, region.x + region.width);
        const bottom = Math.max(previous.y + previous.height, region.y + region.height);
        previous.x = Math.min(previous.x, region.x);
        previous.y = Math.min(previous.y, region.y);
        previous.width = right - previous.x;
        previous.height = bottom - previous.y;
        previous.confidence = Math.max(previous.confidence, region.confidence);
      } else {
        merged.push({ ...region });
      }
    }
    return merged.filter((region) => region.height * height >= 8);
  }

  function detectSubtitleRegions(frames, width, height, options = {}) {
    if (!frames.length || width < 8 || height < 8) return [];
    const contrastThreshold = options.contrastThreshold || 82;
    const minEdgeDensity = options.minEdgeDensity || 0.035;
    const minPersistence = options.minPersistence || 0.28;
    const maxRegions = options.maxRegions || 3;
    const minY = Math.floor(height * 0.035);
    const maxY = Math.floor(height * 0.94);
    const average = new Float64Array(height);
    const persistence = new Float64Array(height);

    for (const frame of frames) {
      for (let y = minY; y < maxY; y++) {
        const density = rowDensity(frame, width, y, contrastThreshold);
        average[y] += density;
        if (density >= minEdgeDensity * 0.72) persistence[y]++;
      }
    }
    for (let y = minY; y < maxY; y++) {
      average[y] /= frames.length;
      persistence[y] /= frames.length;
    }

    const smoothed = smooth(average, 2);
    const active = (y) => smoothed[y] >= minEdgeDensity && persistence[y] >= minPersistence;
    const candidates = [];
    let y = minY;
    while (y < maxY) {
      if (!active(y)) { y++; continue; }
      const top = y;
      let bottom = y;
      let quiet = 0;
      let peak = 0;
      let persistencePeak = 0;
      while (y < maxY && quiet < 5) {
        if (active(y)) {
          bottom = y;
          quiet = 0;
          peak = Math.max(peak, smoothed[y]);
          persistencePeak = Math.max(persistencePeak, persistence[y]);
        } else {
          quiet++;
        }
        y++;
      }
      const bandHeight = bottom - top + 2;
      if (bandHeight < 6 || bandHeight > height * 0.24) continue;
      const bounds = horizontalBounds(frames, width, top, bottom, contrastThreshold);
      if (!bounds) continue;
      const bandWidth = bounds.right - bounds.left;
      if (bandWidth < width * 0.12) continue;
      const centreY = (top + bottom) / 2;
      const score = peak * (0.6 + persistencePeak * 0.4) * zoneWeight(centreY, height);
      candidates.push({
        x: bounds.left / width,
        y: top / height,
        width: bandWidth / width,
        height: bandHeight / height,
        confidence: Math.min(1, score / 0.12),
        score,
        orientation: "horizontal"
      });
    }

    candidates.push(...verticalCandidates(frames, width, height, contrastThreshold, minEdgeDensity, minPersistence));

    // Keep strong, separated bands. This handles a top headline and bottom
    // speech captions without turning a dense article screenshot into one huge mask.
    const selected = [];
    for (const candidate of candidates.sort((a, b) => b.score - a.score)) {
      if (selected.some((region) => {
        const overlap = Math.min(region.y + region.height, candidate.y + candidate.height) - Math.max(region.y, candidate.y);
        return overlap > Math.min(region.height, candidate.height) * 0.45;
      })) continue;
      selected.push(candidate);
      if (selected.length >= maxRegions) break;
    }

    return mergeNearby(selected, height)
      .sort((a, b) => a.y - b.y)
      .map(({ score, orientation, ...region }) => region);
  }

  function detectSubtitleRegion(frames, width, height, options = {}) {
    const regions = detectSubtitleRegions(frames, width, height, { ...options, maxRegions: 1 });
    return regions[0] || null;
  }

  return { detectSubtitleRegion, detectSubtitleRegions };
});
