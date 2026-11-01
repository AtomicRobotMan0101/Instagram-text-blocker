"use strict";

const DEFAULTS = { enabled: true, analysisDelayMs: 3000, padding: 12, sampleIntervalMs: 250, maxMasks: 3 };
let settings = { ...DEFAULTS };
let currentVideo = null;
let currentSource = "";
let masks = [];
let runId = 0;
let manual = false;
let activeRegions = [];

function toast(text) {
  const old = document.querySelector(".itb-toast");
  if (old) old.remove();
  const node = document.createElement("div");
  node.className = "itb-toast";
  node.textContent = text;
  document.documentElement.appendChild(node);
  setTimeout(() => node.remove(), 2600);
}

function visibleReelVideo() {
  return [...document.querySelectorAll("video")]
    .filter((video) => {
      const r = video.getBoundingClientRect();
      return r.width > 180 && r.height > 180 && r.bottom > 0 && r.top < innerHeight && !video.paused;
    })
    .sort((a, b) => {
      const ar = a.getBoundingClientRect();
      const br = b.getBoundingClientRect();
      return (br.width * br.height) - (ar.width * ar.height);
    })[0] || null;
}

function removeMasks() {
  masks.forEach((mask) => mask.remove());
  masks = [];
  manual = false;
  activeRegions = [];
}

function positionMasks(video, regions) {
  const r = video.getBoundingClientRect();
  const pad = settings.padding;
  masks.forEach((mask, index) => {
    const region = regions[index];
    if (!region) return;
    const left = Math.max(r.left, r.left + region.x * r.width - pad);
    const top = Math.max(r.top, r.top + region.y * r.height - pad);
    const right = Math.min(r.right, r.left + (region.x + region.width) * r.width + pad);
    const bottom = Math.min(r.bottom, r.top + (region.y + region.height) * r.height + pad);
    mask.style.left = `${left}px`;
    mask.style.top = `${top}px`;
    mask.style.width = `${Math.max(1, right - left)}px`;
    mask.style.height = `${Math.max(1, bottom - top)}px`;
  });
}

function placeMasks(video, regions) {
  removeMasks();
  activeRegions = regions;
  masks = regions.map(() => {
    const mask = document.createElement("div");
    mask.className = "itb-mask";
    document.documentElement.appendChild(mask);
    return mask;
  });
  positionMasks(video, regions);
}

function enableManual(video) {
  const r = video.getBoundingClientRect();
  placeMasks(video, [{ x: .12, y: .68, width: .76, height: .13 }]);
  manual = true;
  const mask = masks[0];
  mask.classList.add("itb-manual");
  let offset = null;
  mask.addEventListener("pointerdown", (event) => {
    if (event.target !== mask) return;
    const mr = mask.getBoundingClientRect();
    // Leave the lower-right corner to the browser's native CSS resize handle.
    if (event.clientX > mr.right - 20 && event.clientY > mr.bottom - 20) return;
    offset = { x: event.clientX - mr.left, y: event.clientY - mr.top };
    mask.setPointerCapture(event.pointerId);
  });
  mask.addEventListener("pointermove", (event) => {
    if (!offset) return;
    mask.style.left = `${event.clientX - offset.x}px`;
    mask.style.top = `${event.clientY - offset.y}px`;
  });
  mask.addEventListener("pointerup", () => { offset = null; });
  toast("Manual mask: drag it; resize from the lower-right corner. Alt+Shift+M to finish.");
}

async function analyse(video, id) {
  const sourceWidth = video.videoWidth;
  const sourceHeight = video.videoHeight;
  if (!sourceWidth || !sourceHeight) return;
  const width = Math.min(360, sourceWidth);
  const height = Math.max(1, Math.round(sourceHeight * width / sourceWidth));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  const frames = [];
  const deadline = performance.now() + settings.analysisDelayMs;

  while (performance.now() < deadline && id === runId && video === currentVideo) {
    try {
      context.drawImage(video, 0, 0, width, height);
      frames.push(context.getImageData(0, 0, width, height).data.slice());
    } catch (error) {
      console.info("Instagram Text Blocker: video pixels are not origin-clean", error);
      toast("Automatic capture blocked by Firefox/media origin. Press Alt+Shift+M for a manual mask.");
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, settings.sampleIntervalMs));
  }
  if (id !== runId || !settings.enabled || video !== currentVideo) return;
  const regions = SubtitleDetector.detectSubtitleRegions(frames, width, height, { maxRegions: settings.maxMasks });
  if (regions.length) placeMasks(video, regions);
  else toast("No stable subtitle region found. Press Alt+Shift+M for a manual mask.");
}

function inspect() {
  const video = visibleReelVideo();
  const source = video ? video.currentSrc : "";
  if (video === currentVideo && source === currentSource) return;
  currentVideo = video;
  currentSource = source;
  runId++;
  removeMasks();
  if (video && settings.enabled) analyse(video, runId);
}

browser.runtime.onMessage.addListener((message) => {
  if (message.type === "toggle-mask") {
    settings.enabled = !settings.enabled;
    if (!settings.enabled) removeMasks();
    else {
      runId++;
      if (currentVideo) analyse(currentVideo, runId);
      else inspect();
    }
    toast(`Text blocker ${settings.enabled ? "on" : "off"}`);
  }
  if (message.type === "manual-mask") {
    if (manual) { manual = false; masks[0].classList.remove("itb-manual"); }
    else if (currentVideo) enableManual(currentVideo);
  }
  if (message.type === "settings-updated") browser.storage.local.get(DEFAULTS).then((value) => {
    settings = value;
    runId++;
    removeMasks();
    if (currentVideo && settings.enabled) analyse(currentVideo, runId);
    else inspect();
  });
});

browser.storage.local.get(DEFAULTS).then((value) => {
  settings = value;
  inspect();
  setInterval(inspect, 700);
});

addEventListener("resize", () => {
  if (masks.length && !manual && currentVideo && activeRegions.length) positionMasks(currentVideo, activeRegions);
});
