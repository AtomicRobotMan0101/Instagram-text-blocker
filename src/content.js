"use strict";

const DEFAULTS = { enabled: true, analysisDelayMs: 3000, padding: 12, sampleIntervalMs: 250 };
let settings = { ...DEFAULTS };
let currentVideo = null;
let currentSource = "";
let mask = null;
let runId = 0;
let manual = false;
let activeRegion = null;

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

function removeMask() {
  if (mask) mask.remove();
  mask = null;
  manual = false;
  activeRegion = null;
}

function positionMask(video, region) {
  const r = video.getBoundingClientRect();
  const pad = settings.padding;
  if (!mask) return;
  mask.style.left = `${r.left + region.x * r.width - pad}px`;
  mask.style.top = `${r.top + region.y * r.height - pad}px`;
  mask.style.width = `${region.width * r.width + pad * 2}px`;
  mask.style.height = `${region.height * r.height + pad * 2}px`;
}

function placeMask(video, region) {
  removeMask();
  activeRegion = region;
  mask = document.createElement("div");
  mask.className = "itb-mask";
  document.documentElement.appendChild(mask);
  positionMask(video, region);
}

function enableManual(video) {
  const r = video.getBoundingClientRect();
  placeMask(video, { x: .12, y: .68, width: .76, height: .13 });
  manual = true;
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
  const region = SubtitleDetector.detectSubtitleRegion(frames, width, height);
  if (region) placeMask(video, region);
  else toast("No stable subtitle region found. Press Alt+Shift+M for a manual mask.");
}

function inspect() {
  const video = visibleReelVideo();
  const source = video ? video.currentSrc : "";
  if (video === currentVideo && source === currentSource) return;
  currentVideo = video;
  currentSource = source;
  runId++;
  removeMask();
  if (video && settings.enabled) analyse(video, runId);
}

browser.runtime.onMessage.addListener((message) => {
  if (message.type === "toggle-mask") {
    settings.enabled = !settings.enabled;
    if (!settings.enabled) removeMask();
    else {
      runId++;
      if (currentVideo) analyse(currentVideo, runId);
      else inspect();
    }
    toast(`Text blocker ${settings.enabled ? "on" : "off"}`);
  }
  if (message.type === "manual-mask") {
    if (manual) { manual = false; mask.classList.remove("itb-manual"); }
    else if (currentVideo) enableManual(currentVideo);
  }
  if (message.type === "settings-updated") browser.storage.local.get(DEFAULTS).then((value) => {
    settings = value;
    runId++;
    removeMask();
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
  if (mask && !manual && currentVideo && activeRegion) positionMask(currentVideo, activeRegion);
});
