"use strict";
document.querySelectorAll("[data-command]").forEach((button) => button.addEventListener("click", async () => {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  if (tab) await browser.tabs.sendMessage(tab.id, { type: button.dataset.command }).catch(() => {});
  window.close();
}));
document.querySelector("#settings").addEventListener("click", () => browser.runtime.openOptionsPage());
