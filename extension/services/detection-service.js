/**
 * Reactron Authoritative Detection Service (Stage 5)
 * 
 * Responsibilities:
 * 1. Dedicated service interface for monitoring Watch Regions on eligible game tabs.
 * 2. Uses proven Stage 0 visual-difference detection strategy (viewport crop + pixel diff).
 * 3. Integrates pluggable detection adapters (IDetectionAdapter / VisualDiffDetectionAdapter).
 * 4. Integrates StrictnessMapper for centralized, documented threshold mapping.
 * 5. Integrates TriggerDebouncer for cooldown & sustained trigger suppression.
 * 6. Dispatches verified triggers to OverlayEngineService.
 * 7. Strictly handles browser tab lifecycle:
 *    - Only monitors enabled games.
 *    - Pauses/stops when game is disabled, tab is closed, or user navigates to an unsupported URL.
 *    - Handles redirects and same-tab navigation.
 *    - Gracefully reports unsupported pages (chrome://, file:// without access) with clear statuses.
 * 8. Zero leakage into storage internals, UI internals, or reaction configuration details.
 */

import { VisualDiffDetectionAdapter } from './detection-adapter.js';
import { StrictnessMapper } from './strictness-mapper.js';
import { TriggerDebouncer } from './trigger-debouncer.js';
import { OverlayEngineService } from './overlay-engine.js';
import { GameIdentityService } from './game-identity-service.js';
import { ViewportLayoutService } from './viewport-layout-service.js';
import { mediaStorage } from './media-storage.js';

export const MONITORING_STATUS = {
  ACTIVE: 'ACTIVE',               // Monitoring actively on at least one live matching tab
  IDLE: 'IDLE',                   // Game enabled, but no matching game tab currently open
  DISABLED: 'DISABLED',           // Game disabled by user toggle
  UNSUPPORTED_PAGE: 'UNSUPPORTED_PAGE', // Tab is on a restricted or unsupported page
  PERMISSION_DENIED: 'PERMISSION_DENIED', // Tab capture permission denied
  PAUSED_NAVIGATED: 'PAUSED_NAVIGATED'  // Monitored tab navigated away from game URL
};

export class DetectionService {
  /**
   * @param {Object} [options]
   * @param {import('./detection-adapter.js').IDetectionAdapter} [options.adapter]
   * @param {number} [options.samplingRateMs=500]
   */
  constructor(options = {}) {
    this.adapter = options.adapter || new VisualDiffDetectionAdapter();
    this.samplingRateMs = options.samplingRateMs || 500;

    // Active monitoring sessions: Map<sessionKey, MonitoringSession>
    // sessionKey = `${gameId}:${tabId}`
    this._sessions = new Map();

    // Cache of decoded baseline pixels: Map<regionId, { data: Uint8ClampedArray, width: number, height: number }>
    this._baselineCache = new Map();

    // Status listeners for UI synchronization: Set<(statuses: Map<string, Object>) => void>
    this._statusListeners = new Set();

    // Game definitions cache: Map<gameId, GameEntry>
    this._gamesCache = new Map();

    this._isListeningTabEvents = false;
  }

  /**
   * Registers a listener for real-time monitoring status changes (used by Dashboard)
   * @param {(statusMap: Map<string, Object>) => void} listener
   */
  onStatusChange(listener) {
    this._statusListeners.add(listener);
    // Immediately emit current state
    listener(this.getAllStatuses());
    return () => this._statusListeners.delete(listener);
  }

  /**
   * Emits status updates to all registered UI listeners
   * @private
   */
  _notifyStatusChange() {
    const statuses = this.getAllStatuses();
    this._statusListeners.forEach((l) => {
      try {
        l(statuses);
      } catch (err) {
        console.warn('[DetectionService] Status listener error:', err);
      }
    });
  }

  /**
   * Returns true if games have already been loaded into the in-memory cache
   * Used by the background service worker to distinguish wake-from-sleep from warm heartbeats.
   * @returns {boolean}
   */
  hasLoadedGames() {
    return this._gamesCache.size > 0;
  }

  /**
   * Computes a signature of the region's detection parameters (strictness + baseline previewUrl)
   * so the debouncer can be reset immediately when the user adjusts strictness or reselects the area.
   * @param {Object} region
   * @returns {string}
   * @private
   */
  _getRegionSignature(region) {
    if (!region) return '';
    return `${region.strictness ?? ''}|${region.previewUrl ?? ''}`;
  }

  /**
   * Synchronizes monitoring sessions with current saved games list
   * Called whenever games are loaded, added, updated, or toggled.
   * 
   * @param {Array<import('../shared/types.js').GameEntry>} games
   */
  async syncWithGames(games) {
    if (!Array.isArray(games)) return;

    // Clear baseline cache so reselected regions immediately use updated previewUrl baselines
    this._baselineCache.clear();

    // Update games cache
    this._gamesCache.clear();
    const activeGameIds = new Set();

    games.forEach((g) => {
      this._gamesCache.set(g.id, g);
      if (g.isEnabled) {
        activeGameIds.add(g.id);
      }
    });

    // 1. Stop sessions for games that are now disabled or deleted, and reconcile regionDebouncers for active sessions
    for (const [key, session] of this._sessions.entries()) {
      if (!activeGameIds.has(session.gameId)) {
        await this.stopSession(key, 'Game disabled or removed');
      } else {
        const updatedGame = this._gamesCache.get(session.gameId);
        if (updatedGame && session.regionDebouncers) {
          session.gameName = updatedGame.name;
          const validRegionIds = new Set();
          if (Array.isArray(updatedGame.watchRegions)) {
            for (const r of updatedGame.watchRegions) {
              validRegionIds.add(r.id);
              const nextSig = this._getRegionSignature(r);
              const existingDebouncer = session.regionDebouncers.get(r.id);
              if (!existingDebouncer) {
                const debouncer = new TriggerDebouncer();
                debouncer._configSignature = nextSig;
                session.regionDebouncers.set(r.id, debouncer);
              } else if (existingDebouncer._configSignature !== nextSig) {
                existingDebouncer.reset();
                existingDebouncer._configSignature = nextSig;
              }
            }
            await this._preloadBaselines(updatedGame.watchRegions);
          }
          for (const existingRegionId of Array.from(session.regionDebouncers.keys())) {
            if (!validRegionIds.has(existingRegionId)) {
              session.regionDebouncers.delete(existingRegionId);
            }
          }
        }
      }
    }

    // 2. Discover eligible live tabs for enabled games
    await this.scanAndAttachEligibleTabs();

    this._initTabLifecycleListeners();
    this._notifyStatusChange();
  }

  /**
   * Scans browser tabs and attaches monitoring sessions to matching game tabs
   */
  async scanAndAttachEligibleTabs() {
    if (typeof chrome === 'undefined' || !chrome.tabs || !chrome.tabs.query) {
      return;
    }

    const enabledGames = Array.from(this._gamesCache.values()).filter((g) => g.isEnabled);
    if (enabledGames.length === 0) return;

    return new Promise((resolve) => {
      // Safety timeout so monitoring scan never blocks indefinitely
      const timeoutTimer = setTimeout(() => resolve(), 3000);

      try {
        chrome.tabs.query({}, async (tabs) => {
          clearTimeout(timeoutTimer);
          if (!tabs || chrome.runtime.lastError) {
            resolve();
            return;
          }

          try {
            for (const tab of tabs) {
              if (!tab.id || !tab.url) continue;

              // Check if tab URL matches any enabled game
              for (const game of enabledGames) {
                const isMatch = GameIdentityService.matchesUrl(game.url, tab.url);
                const sessionKey = `${game.id}:${tab.id}`;

                if (isMatch) {
                  const eligibility = GameIdentityService.validateTabEligibility(tab.url);
                  if (!eligibility.isEligible) {
                    // Restricted page
                    this._recordUnsupportedTab(game.id, tab.id, eligibility.reason);
                  } else if (!this._sessions.has(sessionKey)) {
                    // Start new session
                    await this.startSession(game.id, tab.id, tab.windowId);
                  }
                } else if (this._sessions.has(sessionKey)) {
                  // Tab was previously matching, but now has navigated elsewhere
                  await this.stopSession(sessionKey, 'Tab navigated to different URL');
                }
              }
            }
          } catch (err) {
            console.warn('[DetectionService] Error during tab scan loop:', err);
          } finally {
            resolve();
          }
        });
      } catch (err) {
        clearTimeout(timeoutTimer);
        console.warn('[DetectionService] Tab query failed:', err);
        resolve();
      }
    });
  }

  /**
   * Starts a monitoring session for a specific game on a specific tab
   * 
   * @param {string} gameId
   * @param {number} tabId
   * @param {number} [windowId]
   */
  async startSession(gameId, tabId, windowId = null) {
    const game = this._gamesCache.get(gameId);
    if (!game || !game.isEnabled) return;

    const sessionKey = `${gameId}:${tabId}`;
    if (this._sessions.has(sessionKey)) {
      return; // Already monitoring
    }

    // Build debouncers for each watch region
    const regionDebouncers = new Map();
    if (Array.isArray(game.watchRegions)) {
      game.watchRegions.forEach((r) => {
        const debouncer = new TriggerDebouncer();
        debouncer._configSignature = this._getRegionSignature(r);
        regionDebouncers.set(r.id, debouncer);
      });
    }

    const session = {
      key: sessionKey,
      gameId,
      tabId,
      windowId,
      gameName: game.name,
      status: MONITORING_STATUS.ACTIVE,
      statusReason: 'Monitoring visual changes active',
      startedAt: Date.now(),
      lastSampleTimestamp: 0,
      lastTriggerTimestamp: 0,
      sampleCount: 0,
      triggerCount: 0,
      lastMeasuredDelta: 0,
      isSampling: false,
      regionDebouncers,
      intervalId: null
    };

    // Preload baseline crops for all watch regions
    await this._preloadBaselines(game.watchRegions);

    // Start sampling interval loop
    session.intervalId = setInterval(() => {
      this._sampleTabSession(session);
    }, this.samplingRateMs);

    this._sessions.set(sessionKey, session);
    this._notifyStatusChange();
  }

  /**
   * Stops an active monitoring session cleanly
   * 
   * @param {string} sessionKey
   * @param {string} [reason='Stopped']
   */
  async stopSession(sessionKey, reason = 'Stopped') {
    const session = this._sessions.get(sessionKey);
    if (!session) return;

    if (session.intervalId) {
      clearInterval(session.intervalId);
      session.intervalId = null;
    }

    // Clean up overlays on the monitored tab
    try {
      await OverlayEngineService.clearOverlays(session.tabId);
    } catch {
      // Ignore if tab already closed
    }

    this._sessions.delete(sessionKey);
    this._notifyStatusChange();
  }

  /**
   * Performs a single visual sample tick for a session
   * @private
   */
  async _sampleTabSession(session) {
    if (session.status !== MONITORING_STATUS.ACTIVE || session.isSampling) return;

    const game = this._gamesCache.get(session.gameId);
    if (!game || !game.isEnabled || !Array.isArray(game.watchRegions) || game.watchRegions.length === 0) {
      return;
    }

    session.isSampling = true;
    try {
      // 1. Verify tab is still alive and check window
      let tabInfo;
      try {
        tabInfo = await this._getTab(session.tabId);
      } catch {
        // Tab has closed
        await this.stopSession(session.key, 'Monitored tab closed');
        return;
      }

      if (!tabInfo) {
        await this.stopSession(session.key, 'Monitored tab no longer available');
        return;
      }

      // 2. Verify URL still matches
      const currentUrl = tabInfo.url || tabInfo.pendingUrl || '';
      if (!GameIdentityService.matchesUrl(game.url, currentUrl)) {
        session.status = MONITORING_STATUS.PAUSED_NAVIGATED;
        session.statusReason = `Tab navigated away to: ${currentUrl.slice(0, 40)}...`;
        this._notifyStatusChange();
        return;
      }

      // 3. Pause capture when tab is not the active foreground tab in its window
      if (!tabInfo.active) {
        return;
      }

      // Capture viewport pixels via extension background capture
      const captureResult = await this._captureTabViewport(tabInfo.windowId);
      if (!captureResult.success || !captureResult.dataUrl) {
        // Tab may be minimized or hidden; do not treat as fatal error, log and retry next tick
        return;
      }

      session.sampleCount++;
      session.lastSampleTimestamp = Date.now();

      // Query live game surface bounds from the active tab (falls back to null if unavailable)
      const liveBounds = await this._queryLiveSurfaceBounds(session.tabId);

      // 4. Iterate over configured watch regions with geometry & baseline preview
      for (const region of game.watchRegions) {
        if (!region.geometry || !region.previewUrl) continue;

        let baseline = this._baselineCache.get(region.id);
        if (!baseline) {
          baseline = await this._decodeDataUrlToPixels(region.previewUrl);
          if (baseline) this._baselineCache.set(region.id, baseline);
        }

        if (!baseline) continue;

        // Map strictness slider (1 - 100%) to detection threshold
        const threshold = StrictnessMapper.mapToChangeDeltaThreshold(region.strictness);

        // Evaluate candidate crops across resize modes (surface-anchored, aspect-contained, viewport)
        let candidateCrops = [];
        if (this._cropImageToPixels !== DetectionService.prototype._cropImageToPixels) {
          const singleCrop = await this._cropImageToPixels(captureResult.dataUrl, region.geometry, liveBounds);
          if (singleCrop) candidateCrops = [singleCrop];
        } else {
          candidateCrops = await this._cropImageCandidatesToPixels(
            captureResult.dataUrl,
            region.geometry,
            liveBounds
          );
        }

        if (!candidateCrops || candidateCrops.length === 0) continue;

        let bestCompResult = null;
        for (const crop of candidateCrops) {
          const res = this.adapter.compare(crop, baseline, { threshold });
          if (!bestCompResult || res.delta > bestCompResult.delta) {
            bestCompResult = res;
          }
        }

        if (!bestCompResult) continue;
        const compResult = bestCompResult;
        session.lastMeasuredDelta = compResult.delta;

        // Evaluate trigger condition with debouncer & cooldown manager
        let debouncer = session.regionDebouncers.get(region.id);
        if (!debouncer) {
          debouncer = new TriggerDebouncer();
          session.regionDebouncers.set(region.id, debouncer);
        }

        const evalResult = debouncer.evaluate(compResult.delta, threshold, Date.now());

        if (evalResult.shouldTrigger) {
          session.triggerCount++;
          session.lastTriggerTimestamp = Date.now();
          this._notifyStatusChange();

          // Dispatch reaction configuration to OverlayEngine
          if (Array.isArray(region.reactionConfigs)) {
            for (const config of region.reactionConfigs) {
              // Only trigger active reactions (has GIF or Text enabled)
              if (config.gifReaction?.enabled || config.textReaction?.enabled) {
                if (
                  config.gifReaction?.enabled &&
                  !config.gifReaction.fileUrl &&
                  config.gifReaction.mediaAssetId
                ) {
                  try {
                    const media = await mediaStorage.getMedia(config.gifReaction.mediaAssetId);
                    if (media && media.dataUrl) {
                      config.gifReaction.fileUrl = media.dataUrl;
                    }
                  } catch (err) {
                    console.warn('[DetectionService] Failed to hydrate GIF media from IndexedDB:', err);
                  }
                }

                await OverlayEngineService.triggerReaction(session.tabId, config, {
                  regionId: region.id,
                  regionName: region.name,
                  regionGeometry: region.geometry,
                  delta: compResult.delta,
                  threshold
                });
              }
            }
          }
        }
      }
    } finally {
      session.isSampling = false;
    }
  }

  /**
   * Queries live game surface bounds from the content script on the monitored tab
   * @param {number} tabId
   * @returns {Promise<Object|null>}
   * @private
   */
  async _queryLiveSurfaceBounds(tabId) {
    if (!tabId || typeof chrome === 'undefined' || !chrome.tabs || typeof chrome.tabs.sendMessage !== 'function') {
      return null;
    }

    return new Promise((resolve) => {
      const timer = setTimeout(() => resolve(null), 150);
      try {
        chrome.tabs.sendMessage(tabId, { action: 'GET_LIVE_SURFACE_BOUNDS' }, (res) => {
          clearTimeout(timer);
          if (chrome.runtime && chrome.runtime.lastError) {
            resolve(null);
          } else {
            resolve(res?.bounds || null);
          }
        });
      } catch {
        clearTimeout(timer);
        resolve(null);
      }
    });
  }

  /**
   * Helper: capture tab visible viewport
   * Supports direct capture inside background service worker or message delegation from UI contexts
   * @private
   */
  async _captureTabViewport(windowId) {
    if (typeof chrome !== 'undefined' && chrome.tabs && typeof chrome.tabs.captureVisibleTab === 'function') {
      const targetWindowId = windowId !== undefined && windowId !== null ? windowId : null;
      return new Promise((resolve) => {
        chrome.tabs.captureVisibleTab(targetWindowId, { format: 'png' }, (dataUrl) => {
          if (chrome.runtime && chrome.runtime.lastError) {
            resolve({ success: false, error: chrome.runtime.lastError.message });
          } else {
            resolve({ success: Boolean(dataUrl), dataUrl });
          }
        });
      });
    }

    if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.sendMessage) {
      return { success: false, error: 'Extension runtime unavailable' };
    }

    return new Promise((resolve) => {
      chrome.runtime.sendMessage({ action: 'CAPTURE_VISIBLE_TAB', windowId }, (res) => {
        if (chrome.runtime.lastError) {
          resolve({ success: false, error: chrome.runtime.lastError.message });
        } else {
          resolve(res || { success: false });
        }
      });
    });
  }

  /**
   * Extracts pixel buffers for all unique candidate projections of a Watch Region
   * across window resize modes (DOM surface bounds, aspect-ratio contain, direct viewport).
   * @param {string} dataUrl
   * @param {import('../shared/types.js').NormalizedGeometry} geometry
   * @param {Object|null} [liveBounds=null]
   * @returns {Promise<Array<ImageData>>}
   * @private
   */
  async _cropImageCandidatesToPixels(dataUrl, geometry, liveBounds = null) {
    if (typeof OffscreenCanvas !== 'undefined') {
      try {
        const resp = await fetch(dataUrl);
        const blob = await resp.blob();
        const bitmap = await createImageBitmap(blob);

        const projections = ViewportLayoutService.getCandidateProjections(
          geometry,
          liveBounds,
          bitmap.width,
          bitmap.height
        );

        const results = [];
        for (const rect of projections) {
          const canvas = new OffscreenCanvas(rect.cropW, rect.cropH);
          const ctx = canvas.getContext('2d');
          if (!ctx) continue;
          ctx.drawImage(bitmap, rect.cropX, rect.cropY, rect.cropW, rect.cropH, 0, 0, rect.cropW, rect.cropH);
          results.push(ctx.getImageData(0, 0, rect.cropW, rect.cropH));
        }
        return results;
      } catch (err) {
        console.warn('[DetectionService] Offscreen candidate crop failed:', err);
        return [];
      }
    }

    // Fallback using HTMLImageElement (if OffscreenCanvas not available)
    if (typeof document !== 'undefined') {
      return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
          const projections = ViewportLayoutService.getCandidateProjections(
            geometry,
            liveBounds,
            img.naturalWidth,
            img.naturalHeight
          );
          const results = [];
          for (const rect of projections) {
            const canvas = document.createElement('canvas');
            canvas.width = rect.cropW;
            canvas.height = rect.cropH;
            const ctx = canvas.getContext('2d');
            if (!ctx) continue;
            ctx.drawImage(img, rect.cropX, rect.cropY, rect.cropW, rect.cropH, 0, 0, rect.cropW, rect.cropH);
            results.push(ctx.getImageData(0, 0, rect.cropW, rect.cropH));
          }
          resolve(results);
        };
        img.onerror = () => resolve([]);
        img.src = dataUrl;
      });
    }

    return [];
  }

  /**
   * Helper: crops full captured viewport to primary projected region coordinates and returns pixel buffer
   * @private
   */
  async _cropImageToPixels(dataUrl, geometry, liveBounds = null) {
    const candidates = await this._cropImageCandidatesToPixels(dataUrl, geometry, liveBounds);
    return candidates.length > 0 ? candidates[0] : null;
  }

  /**
   * Decodes a base64 / data URL image to an ImageData pixel buffer
   * @private
   */
  async _decodeDataUrlToPixels(dataUrl) {
    if (!dataUrl) return null;

    if (typeof OffscreenCanvas !== 'undefined') {
      try {
        const resp = await fetch(dataUrl);
        const blob = await resp.blob();
        const bitmap = await createImageBitmap(blob);

        const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
        const ctx = canvas.getContext('2d');
        if (!ctx) return null;

        ctx.drawImage(bitmap, 0, 0);
        return ctx.getImageData(0, 0, bitmap.width, bitmap.height);
      } catch {
        return null;
      }
    }

    if (typeof document !== 'undefined') {
      return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          canvas.width = img.naturalWidth;
          canvas.height = img.naturalHeight;
          const ctx = canvas.getContext('2d');
          if (!ctx) return resolve(null);
          ctx.drawImage(img, 0, 0);
          resolve(ctx.getImageData(0, 0, canvas.width, canvas.height));
        };
        img.onerror = () => resolve(null);
        img.src = dataUrl;
      });
    }

    return null;
  }

  /**
   * Preloads baseline pixel caches for regions
   * @private
   */
  async _preloadBaselines(watchRegions) {
    if (!Array.isArray(watchRegions)) return;
    for (const r of watchRegions) {
      try {
        if (r.id && r.previewUrl && !this._baselineCache.has(r.id)) {
          const pixels = await this._decodeDataUrlToPixels(r.previewUrl);
          if (pixels) {
            this._baselineCache.set(r.id, pixels);
          }
        }
      } catch (err) {
        console.warn(`[DetectionService] Warning: Failed to preload baseline for region ${r.id}:`, err);
      }
    }
  }

  /**
   * Helper to query tab by ID
   * @private
   */
  async _getTab(tabId) {
    if (typeof chrome === 'undefined' || !chrome.tabs || !chrome.tabs.get) {
      return null;
    }
    return new Promise((resolve, reject) => {
      chrome.tabs.get(tabId, (tab) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(tab);
        }
      });
    });
  }

  /**
   * Records an unsupported tab status for a game
   * @private
   */
  _recordUnsupportedTab(gameId, tabId, reason) {
    const sessionKey = `${gameId}:${tabId}`;
    if (!this._sessions.has(sessionKey)) {
      this._sessions.set(sessionKey, {
        key: sessionKey,
        gameId,
        tabId,
        status: MONITORING_STATUS.UNSUPPORTED_PAGE,
        statusReason: reason || 'Internal or restricted browser page cannot be monitored',
        sampleCount: 0,
        triggerCount: 0
      });
      this._notifyStatusChange();
    }
  }

  /**
   * Sets up listeners for tab navigation and close events
   * @private
   */
  _initTabLifecycleListeners() {
    if (this._isListeningTabEvents) return;
    if (typeof chrome === 'undefined' || !chrome.tabs) return;

    this._isListeningTabEvents = true;

    // Tab URL updated or redirected
    if (chrome.tabs.onUpdated) {
      chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
        if (changeInfo.url || changeInfo.status === 'complete') {
          await this.scanAndAttachEligibleTabs();
        }
      });
    }

    // Tab closed
    if (chrome.tabs.onRemoved) {
      chrome.tabs.onRemoved.addListener((tabId) => {
        for (const [key, session] of this._sessions.entries()) {
          if (session.tabId === tabId) {
            this.stopSession(key, 'Tab closed');
          }
        }
      });
    }

    // Tab activated / switched
    if (chrome.tabs.onActivated) {
      chrome.tabs.onActivated.addListener(() => {
        this.scanAndAttachEligibleTabs();
      });
    }
  }

  /**
   * Returns current aggregated monitoring status for a game
   * @param {string} gameId
   * @returns {{
   *   status: string,
   *   badgeLabel: string,
   *   badgeVariant: 'active'|'idle'|'disabled'|'warning',
   *   activeTabsCount: number,
   *   reason: string,
   *   triggerCount: number,
   *   lastMeasuredDelta: number
   * }}
   */
  getGameStatus(gameId) {
    const game = this._gamesCache.get(gameId);
    if (!game) {
      return {
        status: MONITORING_STATUS.DISABLED,
        badgeLabel: 'Disabled',
        badgeVariant: 'disabled',
        activeTabsCount: 0,
        reason: 'Game not found',
        triggerCount: 0,
        lastMeasuredDelta: 0
      };
    }

    if (!game.isEnabled) {
      return {
        status: MONITORING_STATUS.DISABLED,
        badgeLabel: 'Disabled',
        badgeVariant: 'disabled',
        activeTabsCount: 0,
        reason: 'Monitoring disabled by user',
        triggerCount: 0,
        lastMeasuredDelta: 0
      };
    }

    // Find active sessions for this game
    const gameSessions = Array.from(this._sessions.values()).filter((s) => s.gameId === gameId);
    const activeSessions = gameSessions.filter((s) => s.status === MONITORING_STATUS.ACTIVE);
    const unsupportedSessions = gameSessions.filter((s) => s.status === MONITORING_STATUS.UNSUPPORTED_PAGE);

    if (unsupportedSessions.length > 0 && activeSessions.length === 0) {
      return {
        status: MONITORING_STATUS.UNSUPPORTED_PAGE,
        badgeLabel: 'Unsupported Page',
        badgeVariant: 'warning',
        activeTabsCount: 0,
        reason: unsupportedSessions[0].statusReason || 'Page cannot be monitored',
        triggerCount: 0,
        lastMeasuredDelta: 0
      };
    }

    if (activeSessions.length > 0) {
      const totalTriggers = activeSessions.reduce((acc, s) => acc + s.triggerCount, 0);
      const latestDelta = activeSessions[0].lastMeasuredDelta || 0;
      return {
        status: MONITORING_STATUS.ACTIVE,
        badgeLabel: `Monitoring (${activeSessions.length} active tab${activeSessions.length > 1 ? 's' : ''})`,
        badgeVariant: 'active',
        activeTabsCount: activeSessions.length,
        reason: `Actively watching for visual changes (${activeSessions.length} tab)`,
        triggerCount: totalTriggers,
        lastMeasuredDelta: latestDelta
      };
    }

    return {
      status: MONITORING_STATUS.IDLE,
      badgeLabel: 'No Active Game Tab',
      badgeVariant: 'idle',
      activeTabsCount: 0,
      reason: 'Open the game tab to start automatic monitoring',
      triggerCount: 0,
      lastMeasuredDelta: 0
    };
  }

  /**
   * Retrieves statuses for all cached games
   * @returns {Map<string, Object>}
   */
  getAllStatuses() {
    const result = new Map();
    for (const [id] of this._gamesCache.entries()) {
      result.set(id, this.getGameStatus(id));
    }
    return result;
  }
}

export const detectionService = new DetectionService();
