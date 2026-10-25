/**
 * Reactron Stage 0 Feasibility Spike - Background Service Worker
 * 
 * Primary responsibility:
 * 1. Capture tab visible pixels via chrome.tabs.captureVisibleTab (avoids canvas tainting / WebGL buffer clears)
 * 2. Route messages between popup and content scripts
 * 3. Handle helper commands (e.g., opening bundled test-game.html)
 */

// Configure Side Panel behavior so clicking the action icon opens the side panel
function configureSidePanelBehavior() {
  if (typeof chrome !== 'undefined' && chrome.sidePanel && chrome.sidePanel.setPanelBehavior) {
    chrome.sidePanel
      .setPanelBehavior({ openPanelOnActionClick: true })
      .catch((err) => console.warn('[Reactron] Side panel behavior warning:', err));
  }
}

chrome.runtime.onInstalled.addListener(() => {
  console.log('[Reactron] Background service worker initialized.');
  configureSidePanelBehavior();
});

configureSidePanelBehavior();

// Fallback action click listener if openPanelOnActionClick is not natively supported
if (typeof chrome !== 'undefined' && chrome.action && chrome.action.onClicked) {
  chrome.action.onClicked.addListener(async (tab) => {
    if (chrome.sidePanel && chrome.sidePanel.open) {
      try {
        await chrome.sidePanel.open({ windowId: tab.windowId });
      } catch (err) {
        console.warn('[Reactron] Fallback open side panel:', err);
      }
    }
  });
}

// Listen for messages from content scripts or popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'CAPTURE_VISIBLE_TAB') {
    // Capture visible viewport of the active tab in sender's window or target window
    const targetWindowId = (message.windowId !== undefined && message.windowId !== null)
      ? message.windowId
      : (sender.tab ? sender.tab.windowId : null);
    chrome.tabs.captureVisibleTab(targetWindowId, { format: 'png' }, (dataUrl) => {
      if (chrome.runtime.lastError) {
        sendResponse({
          success: false,
          error: chrome.runtime.lastError.message
        });
      } else {
        sendResponse({
          success: true,
          dataUrl: dataUrl
        });
      }
    });
    return true; // Keep message channel open for async response
  }

  if (message.action === 'OPEN_TEST_GAME') {
    const testGameUrl = chrome.runtime.getURL('test-game.html');
    chrome.tabs.create({ url: testGameUrl }, (tab) => {
      sendResponse({ success: true, tabId: tab.id });
    });
    return true;
  }

  if (message.action === 'GET_EXTENSION_INFO') {
    sendResponse({
      name: chrome.runtime.getManifest().name,
      version: chrome.runtime.getManifest().version,
      id: chrome.runtime.id
    });
    return true;
  }
});
