/**
 * Reactron Shared Overlay Engine Service
 * 
 * Responsibilities:
 * 1. Single orchestration interface for previewing, timing, and repositioning reaction items.
 * 2. Manages preview lifecycle without modifying saved database configurations.
 * 3. Dispatches render and reposition commands to the target game tab.
 * 4. Ensures strict separation from detection engines and storage backends.
 */

export class OverlayEngineService {
  /**
   * Previews a reaction configuration directly on the active tab
   * @param {number|null} tabId - Target Chrome tab ID (null queries active tab)
   * @param {import('../shared/types.js').ReactionConfig} config - Reaction configuration
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  static async previewReaction(tabId, config) {
    if (!config) return { success: false, error: 'No configuration provided' };

    const immediatePreviewConfig = {
      ...config,
      gifReaction: config.gifReaction
        ? { ...config.gifReaction, delaySeconds: 0 }
        : undefined,
      textReaction: config.textReaction
        ? { ...config.textReaction, delaySeconds: 0 }
        : undefined
    };

    return this._sendMessageToTab(tabId, {
      action: 'RENDER_OVERLAY_PREVIEW',
      config: immediatePreviewConfig
    });
  }

  /**
   * Triggers an automatic reaction overlay resulting from a detection event
   * Distinguishes production trigger events from manual previews.
   * 
   * @param {number|null} tabId - Target Chrome tab ID
   * @param {import('../shared/types.js').ReactionConfig} config - Reaction configuration
   * @param {Object} [metadata] - Trigger diagnostic metadata (e.g. regionId, delta, timestamp)
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  static async triggerReaction(tabId, config, metadata = {}) {
    if (!config) return { success: false, error: 'No reaction configuration provided' };

    return this._sendMessageToTab(tabId, {
      action: 'RENDER_OVERLAY_REACTION',
      config,
      metadata: {
        ...metadata,
        triggeredAt: Date.now()
      }
    });
  }

  /**
   * Dismisses and cleans up all active overlays on the target tab
   * @param {number|null} tabId
   * @returns {Promise<{success: boolean}>}
   */
  static async clearOverlays(tabId) {
    return this._sendMessageToTab(tabId, {
      action: 'CLEAR_ALL_OVERLAYS'
    });
  }

  /**
   * Activates Reposition Mode for a specific item on the active tab
   * @param {number|null} tabId
   * @param {'gif'|'text'} itemType - 'gif' | 'text'
   * @param {Object} itemData - Item configuration with current position
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  static async startReposition(tabId, itemType, itemData) {
    return this._sendMessageToTab(tabId, {
      action: 'START_REPOSITION_MODE',
      itemType,
      itemData
    });
  }

  /**
   * Finishes Reposition Mode and retrieves final normalized position
   * @param {number|null} tabId
   * @returns {Promise<{success: boolean, position?: import('../shared/types.js').NormalizedPosition}>}
   */
  static async finishReposition(tabId) {
    return this._sendMessageToTab(tabId, {
      action: 'FINISH_REPOSITION_MODE'
    });
  }

  /**
   * Cancels Reposition Mode, restoring original item position
   * @param {number|null} tabId
   * @returns {Promise<{success: boolean}>}
   */
  static async cancelReposition(tabId) {
    return this._sendMessageToTab(tabId, {
      action: 'CANCEL_REPOSITION_MODE'
    });
  }

  /**
   * Internal helper to send messages to active tab
   * @private
   */
  static async _sendMessageToTab(tabId, message) {
    if (typeof chrome === 'undefined' || !chrome.tabs) {
      console.log('[OverlayEngine Mock]', message.action, message);
      return { success: true };
    }

    const isWebTab = (t) => {
      if (!t || !t.id) return false;
      const url = (t.url || t.pendingUrl || '').toLowerCase();
      return (
        !url.startsWith('chrome://') &&
        !url.startsWith('chrome-extension://') &&
        !url.startsWith('edge://') &&
        !url.startsWith('about:') &&
        !url.startsWith('devtools://')
      );
    };

    return new Promise((resolve) => {
      const send = async (targetId) => {
        if (chrome.scripting && chrome.scripting.executeScript) {
          try {
            await chrome.scripting.executeScript({
              target: { tabId: targetId },
              files: ['content/content-script.js']
            });
            if (chrome.scripting.insertCSS) {
              await chrome.scripting.insertCSS({
                target: { tabId: targetId },
                files: ['content/content-style.css']
              });
            }
          } catch {
            // Script already loaded or restricted
          }
        }

        chrome.tabs.sendMessage(targetId, message, (response) => {
          if (chrome.runtime.lastError) {
            console.warn('[OverlayEngine] Tab message error:', chrome.runtime.lastError.message);
            resolve({ success: false, error: chrome.runtime.lastError.message });
          } else {
            resolve(response || { success: true });
          }
        });
      };

      if (tabId) {
        send(tabId);
      } else {
        const querySpecs = [
          { active: true, lastFocusedWindow: true },
          { active: true, currentWindow: true },
          { active: true }
        ];

        const tryQuery = (index) => {
          if (index >= querySpecs.length) {
            resolve({ success: false, error: 'No active game tab found' });
            return;
          }

          chrome.tabs.query(querySpecs[index], (tabs) => {
            const found = tabs && tabs.find(isWebTab);
            if (found?.id) {
              send(found.id);
            } else {
              tryQuery(index + 1);
            }
          });
        };

        tryQuery(0);
      }
    });
  }
}
