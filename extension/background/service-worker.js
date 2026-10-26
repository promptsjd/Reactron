/**
 * Reactron Background Service Worker
 * 
 * Primary responsibility:
 * 1. Capture tab visible pixels via chrome.tabs.captureVisibleTab (avoids canvas tainting / WebGL buffer clears)
 * 2. Run continuous visual fingerprint monitoring in the background even when the side panel is closed
 * 3. Route messages between popup and content scripts
 */

import { persistenceService } from '../services/persistence-service.js';
import { detectionService } from '../services/detection-service.js';
import { STORAGE_KEYS } from '../shared/schema.js';

let isSyncing = false;
let pendingSync = false;

/**
 * Synchronizes active background detection sessions with persisted games
 */
async function syncBackgroundDetection() {
  if (isSyncing) {
    pendingSync = true;
    return;
  }
  isSyncing = true;
  try {
    do {
      pendingSync = false;
      await persistenceService.initialize();
      const games = await persistenceService.getGames();
      await detectionService.syncWithGames(games);
    } while (pendingSync);
  } catch (err) {
    console.warn('[Reactron] Background detection sync warning:', err);
  } finally {
    isSyncing = false;
  }
}

/**
 * Ensures background detection stays active across MV3 service worker sleep/wake cycles
 * without resetting active debouncers or baseline caches when already warm.
 */
async function ensureBackgroundDetectionAlive() {
  try {
    if (!detectionService.hasLoadedGames()) {
      await syncBackgroundDetection();
    } else {
      await detectionService.scanAndAttachEligibleTabs();
    }
  } catch (err) {
    console.warn('[Reactron] Background keep-alive check warning:', err);
  }
}

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
  syncBackgroundDetection();
});

if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onStartup) {
  chrome.runtime.onStartup.addListener(() => {
    configureSidePanelBehavior();
    syncBackgroundDetection();
  });
}

configureSidePanelBehavior();
syncBackgroundDetection();

// Automatically resync background detection when games are added, edited, toggled, or deleted
if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.onChanged) {
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === 'local' && changes[STORAGE_KEYS.GAMES]) {
      syncBackgroundDetection();
    }
  });
}

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

  if (message.action === 'SYNC_DETECTION_GAMES') {
    syncBackgroundDetection()
      .then(() => sendResponse({ success: true }))
      .catch((err) => sendResponse({ success: false, error: err?.message || 'Sync failed' }));
    return true;
  }

  if (message.action === 'KEEP_ALIVE_HEARTBEAT') {
    ensureBackgroundDetectionAlive()
      .then(() => sendResponse({ success: true }))
      .catch(() => sendResponse({ success: false }));
    return true;
  }
});
