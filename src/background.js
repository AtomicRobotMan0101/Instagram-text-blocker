"use strict";

browser.commands.onCommand.addListener(async (command) => {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  if (tab && tab.id) browser.tabs.sendMessage(tab.id, { type: command }).catch(() => {});
});
