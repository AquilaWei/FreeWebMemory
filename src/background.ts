// Service worker entry. Discard logic arrives in later features (F3/F4).
chrome.runtime.onInstalled.addListener(() => {
  console.info("Memory Saver installed");
});
