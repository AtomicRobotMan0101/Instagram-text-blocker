"use strict";
const defaults = { enabled: true, analysisDelayMs: 3000, padding: 12 };
browser.storage.local.get(defaults).then((value) => {
  document.querySelector("#enabled").checked = value.enabled;
  document.querySelector("#delay").value = value.analysisDelayMs / 1000;
  document.querySelector("#padding").value = value.padding;
});
document.querySelector("#save").addEventListener("click", async () => {
  await browser.storage.local.set({
    enabled: document.querySelector("#enabled").checked,
    analysisDelayMs: Number(document.querySelector("#delay").value) * 1000,
    padding: Number(document.querySelector("#padding").value)
  });
  const tabs = await browser.tabs.query({ url: "https://www.instagram.com/*" });
  tabs.forEach((tab) => browser.tabs.sendMessage(tab.id, { type: "settings-updated" }).catch(() => {}));
  document.querySelector("#status").textContent = "Saved";
});
