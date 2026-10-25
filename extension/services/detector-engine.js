/**
 * @file src/extension-engine/detector.js
 * @module DetectorEngine
 * @description Single-Responsibility Module: DOM & Multi-Reaction Visual State Observation Engine.
 */

import { ENGINE_CONSTANTS } from './constants.js';
import { TriggerPluginRegistry } from './plugin-registry.js';
import {
  captureCanvasRegionSnapshot,
  computeFingerprintSimilarity,
  computeHysteresisResetFloor
} from './visual-fingerprint-service.js';

export {
  captureCanvasRegionSnapshot,
  computeFingerprintSimilarity,
  computeHysteresisResetFloor
};

export class DetectorEngine {
  constructor(getDetectionConfig) {
    this.getConfig = getDetectionConfig;
    this.observer = null;
    this.visualPollTimer = null;
    this.targetRoot = null;
    this.state = 'DORMANT';
    this.debounceTimer = null;
    this.mutationsCount = 0;
    this.lastVisualSimilarityPct = 0;

    /** Independent per-reaction state latches keyed by reactionId */
    this.reactionLatches = new Map();

    this.customStrategies = new Map();
    this.gameOverListeners = new Set();
    this.roundResetListeners = new Set();
    this.stateChangeListeners = new Set();
    this.visualSimilarityListeners = new Set();

    this.evaluationContext = {
      isInternalNode: this.isOverlayInternalNode.bind(this),
      isElementVisible: this.isElementVisible.bind(this),
      emitVisualSimilarity: (pct) => this.emitVisualSimilarity(pct)
    };
  }

  registerStrategy(name, strategyFn) {
    this.customStrategies.set(name, strategyFn);
  }

  onGameOverDetected(callback) {
    this.gameOverListeners.add(callback);
    return () => this.gameOverListeners.delete(callback);
  }

  onRoundReset(callback) {
    this.roundResetListeners.add(callback);
    return () => this.roundResetListeners.delete(callback);
  }

  onStateChange(callback) {
    this.stateChangeListeners.add(callback);
    return () => this.stateChangeListeners.delete(callback);
  }

  onVisualSimilarityChange(callback) {
    this.visualSimilarityListeners.add(callback);
    return () => this.visualSimilarityListeners.delete(callback);
  }

  start(rootNode) {
    const target = rootNode || (typeof document !== 'undefined' ? document.body : null);
    if (!target) return;

    this.stop();
    this.targetRoot = target;
    this.reactionLatches.clear();
    this.setState('WATCHING');

    this.observer = new MutationObserver((mutations) => {
      const relevant = mutations.some((mutation) => {
        if (this.isOverlayInternalNode(mutation.target)) return false;
        for (let i = 0; i < mutation.addedNodes.length; i++) {
          if (!this.isOverlayInternalNode(mutation.addedNodes[i])) return true;
        }
        for (let i = 0; i < mutation.removedNodes.length; i++) {
          if (!this.isOverlayInternalNode(mutation.removedNodes[i])) return true;
        }
        return mutation.type === 'attributes' || mutation.type === 'characterData';
      });

      if (relevant) {
        this.mutationsCount += mutations.length;
        this.scheduleEvaluation();
      }
    });

    this.observer.observe(this.targetRoot, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: [...ENGINE_CONSTANTS.DETECTION_DEFAULTS.OBSERVED_ATTRIBUTES]
    });

    this.visualPollTimer = window.setInterval(() => {
      if (this.state !== 'DORMANT') {
        this.evaluateDOM();
      }
    }, ENGINE_CONSTANTS.TIMING.VISUAL_POLL_INTERVAL_MS);

    this.scheduleEvaluation();
  }

  stop() {
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }
    if (this.visualPollTimer !== null) {
      window.clearInterval(this.visualPollTimer);
      this.visualPollTimer = null;
    }
    if (this.debounceTimer !== null) {
      window.clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    this.reactionLatches.clear();
    this.setState('DORMANT');
  }

  resetReactionLatch(reactionId) {
    const latch = this.reactionLatches.get(reactionId);
    if (latch && latch.state === 'TRIGGERED_LATCHED') {
      const previousState = latch.state;
      latch.state = 'WATCHING';
      this.syncAggregateStateFromReactionLatches();
      this.roundResetListeners.forEach((cb) =>
        cb({ timestamp: Date.now(), previousState, reactionId })
      );
    }
  }

  resetTriggerLatch() {
    for (const [rxnId, latch] of this.reactionLatches.entries()) {
      if (latch.state === 'TRIGGERED_LATCHED') {
        const previousState = latch.state;
        latch.state = 'WATCHING';
        this.roundResetListeners.forEach((cb) =>
          cb({ timestamp: Date.now(), previousState, reactionId: rxnId })
        );
      }
    }
    if (this.state === 'TRIGGERED_LATCHED') {
      const previousState = this.state;
      this.setState('WATCHING');
      this.roundResetListeners.forEach((cb) =>
        cb({ timestamp: Date.now(), previousState })
      );
    }
  }

  scanNow() {
    this.evaluateDOM();
  }

  getState() {
    return this.state;
  }

  getReactionState(reactionId) {
    if (this.state === 'DORMANT') return 'DORMANT';
    return this.reactionLatches.get(reactionId)?.state || 'WATCHING';
  }

  getReactionSimilarityPct(reactionId) {
    return this.reactionLatches.get(reactionId)?.lastSimilarityPct ?? 0;
  }

  getMutationsCount() {
    return this.mutationsCount;
  }

  getLastVisualSimilarityPct() {
    return this.lastVisualSimilarityPct;
  }

  setState(nextState) {
    if (this.state !== nextState) {
      this.state = nextState;
      this.stateChangeListeners.forEach((cb) => cb(nextState));
    }
  }

  syncAggregateStateFromReactionLatches() {
    if (this.state === 'DORMANT') return;
    let anyLatched = false;
    for (const latch of this.reactionLatches.values()) {
      if (latch.state === 'TRIGGERED_LATCHED') {
        anyLatched = true;
        break;
      }
    }
    this.setState(anyLatched ? 'TRIGGERED_LATCHED' : 'WATCHING');
  }

  emitVisualSimilarity(pct, reactionId) {
    if (this.lastVisualSimilarityPct !== pct || reactionId) {
      this.lastVisualSimilarityPct = pct;
      this.visualSimilarityListeners.forEach((cb) => cb(pct, reactionId));
    }
  }

  scheduleEvaluation() {
    if (this.state === 'DORMANT') return;
    const config = this.getConfig();
    const debounceMs =
      typeof config.debounceMs === 'number'
        ? config.debounceMs
        : ENGINE_CONSTANTS.TIMING.DEFAULT_DEBOUNCE_MS;

    if (this.debounceTimer !== null) {
      window.clearTimeout(this.debounceTimer);
    }
    this.debounceTimer = window.setTimeout(() => {
      this.debounceTimer = null;
      this.evaluateDOM();
    }, debounceMs);
  }

  evaluateDOM() {
    if (!this.targetRoot || this.state === 'DORMANT') return;

    const config = this.getConfig();
    const activeTriggerId =
      config.triggerMode || ENGINE_CONSTANTS.DETECTION_DEFAULTS.DEFAULT_TRIGGER_MODE;

    const hasCustomOverride = this.customStrategies.has(activeTriggerId);
    if (
      activeTriggerId === 'visual-box' &&
      !hasCustomOverride &&
      Array.isArray(config.reactions) &&
      config.reactions.length > 0
    ) {
      this.evaluateMultipleReactions(this.targetRoot, config, config.reactions);
      return;
    }

    const { result, autoResetOnClear } = this.runActivePlugin(
      this.targetRoot,
      config,
      activeTriggerId
    );

    if (result.matched) {
      if (this.state === 'WATCHING') {
        this.setState('TRIGGERED_LATCHED');
        const payload = {
          timestamp: Date.now(),
          strategyName: result.strategyName || activeTriggerId,
          matchedDetail: result.detail || 'Matched Trigger',
          mutationsEvaluated: this.mutationsCount,
          similarityPct: result.similarityPct
        };
        this.gameOverListeners.forEach((listener) => {
          try {
            listener(payload);
          } catch (err) {
            console.error('[DetectorEngine] Listener error:', err);
          }
        });
      }
    } else if (this.state === 'TRIGGERED_LATCHED' && autoResetOnClear) {
      if (activeTriggerId === 'visual-box' && config.visualBox?.enabled) {
        const threshold =
          typeof config.visualBox.matchSensitivity === 'number'
            ? config.visualBox.matchSensitivity
            : ENGINE_CONSTANTS.VISUAL_BOX.SENSITIVITY_DEFAULT_PCT;
        const resetFloor = computeHysteresisResetFloor(threshold);
        if (this.lastVisualSimilarityPct >= resetFloor) {
          return;
        }
      }

      const previousState = this.state;
      this.setState('WATCHING');
      this.roundResetListeners.forEach((listener) => {
        try {
          listener({ timestamp: Date.now(), previousState });
        } catch (err) {
          console.error('[DetectorEngine] Reset listener error:', err);
        }
      });
    }
  }

  evaluateMultipleReactions(
    rootElement,
    baseConfig,
    reactions
  ) {
    const activeIds = new Set();
    const visualPlugin = TriggerPluginRegistry.getOrDefault('visual-box', 'visual-box');

    for (const rxn of reactions) {
      if (!rxn || !rxn.id) continue;
      activeIds.add(rxn.id);

      let latch = this.reactionLatches.get(rxn.id);
      if (!latch) {
        latch = {
          reactionId: rxn.id,
          state: 'WATCHING',
          lastSimilarityPct: 0
        };
        this.reactionLatches.set(rxn.id, latch);
      }

      let liveSimPct = 0;
      const rxnContext = {
        isInternalNode: this.isOverlayInternalNode.bind(this),
        isElementVisible: this.isElementVisible.bind(this),
        emitVisualSimilarity: (pct) => {
          liveSimPct = pct;
          latch.lastSimilarityPct = pct;
          this.emitVisualSimilarity(pct, rxn.id);
        }
      };

      const rxnDetectionConfig = {
        ...baseConfig,
        triggerMode: 'visual-box',
        visualBox: rxn.region
      };

      const result = visualPlugin.evaluate(rootElement, rxnDetectionConfig, rxnContext);
      const threshold =
        typeof rxn.region?.matchSensitivity === 'number'
          ? rxn.region.matchSensitivity
          : ENGINE_CONSTANTS.VISUAL_BOX.SENSITIVITY_DEFAULT_PCT;
      const resetFloor = computeHysteresisResetFloor(threshold);

      if (result.matched) {
        if (latch.state === 'WATCHING') {
          latch.state = 'TRIGGERED_LATCHED';
          this.syncAggregateStateFromReactionLatches();

          const payload = {
            timestamp: Date.now(),
            strategyName: result.strategyName || 'visual-box',
            matchedDetail: result.detail || `Reaction ${rxn.id} matched`,
            mutationsEvaluated: this.mutationsCount,
            similarityPct: result.similarityPct ?? liveSimPct,
            reactionId: rxn.id,
            reaction: rxn
          };
          this.gameOverListeners.forEach((listener) => {
            try {
              listener(payload);
            } catch (err) {
              console.error('[DetectorEngine] Listener error:', err);
            }
          });
        }
      } else if (latch.state === 'TRIGGERED_LATCHED' && visualPlugin.autoResetOnClear) {
        if (liveSimPct < resetFloor) {
          const previousState = latch.state;
          latch.state = 'WATCHING';
          this.syncAggregateStateFromReactionLatches();

          this.roundResetListeners.forEach((listener) => {
            try {
              listener({
                timestamp: Date.now(),
                previousState,
                reactionId: rxn.id
              });
            } catch (err) {
              console.error('[DetectorEngine] Reset listener error:', err);
            }
          });
        }
      }
    }

    for (const existingId of Array.from(this.reactionLatches.keys())) {
      if (!activeIds.has(existingId)) {
        this.reactionLatches.delete(existingId);
      }
    }
    this.syncAggregateStateFromReactionLatches();
  }

  runActivePlugin(
    rootElement,
    config,
    activeTriggerId
  ) {
    const customFn = this.customStrategies.get(activeTriggerId);
    if (customFn) {
      return {
        result: customFn(rootElement, config, this.evaluationContext),
        autoResetOnClear: true
      };
    }

    const plugin = TriggerPluginRegistry.getOrDefault(
      activeTriggerId,
      ENGINE_CONSTANTS.DETECTION_DEFAULTS.DEFAULT_TRIGGER_MODE
    );
    const result = plugin.evaluate(rootElement, config, this.evaluationContext);
    return {
      result,
      autoResetOnClear: plugin.autoResetOnClear
    };
  }

  isOverlayInternalNode(node) {
    if (!node) return false;
    const el =
      node.nodeType === Node.ELEMENT_NODE
        ? node
        : node.parentElement;
    if (!el || typeof el.closest !== 'function') return false;
    const { OVERLAY_ROOT_CLASS, IGNORE_ATTR } = ENGINE_CONSTANTS.DETECTION_DEFAULTS;
    return Boolean(
      el.closest(`.${OVERLAY_ROOT_CLASS}`) || el.closest(`[${IGNORE_ATTR}="true"]`)
    );
  }

  isElementVisible(el) {
    if (el.hasAttribute('hidden') || el.getAttribute('aria-hidden') === 'true') {
      return false;
    }

    let current = el;
    while (current && current !== document.body && current !== document.documentElement) {
      const style = window.getComputedStyle(current);
      if (
        style.display === 'none' ||
        style.visibility === 'hidden' ||
        style.visibility === 'collapse' ||
        parseFloat(style.opacity) === 0
      ) {
        return false;
      }
      current = current.parentElement;
    }

    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }
}
