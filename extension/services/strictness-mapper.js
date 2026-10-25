/**
 * Reactron Strictness Mapping Service (Stage 5)
 * 
 * Centralized, authoritative mapping from the user-facing Match Sensitivity slider (1 - 100%)
 * to visual fingerprinting match similarity thresholds.
 * 
 * Semantics:
 * 1. Higher Strictness / Sensitivity (e.g. 80-100%): Requires a closer match to the reference fingerprint
 *    (higher required match threshold e.g. 88% - 95% similarity) to avoid false positives.
 * 2. Lower Strictness (e.g. 1-20%): Tolerates more variation (lower required match threshold e.g. 70% similarity).
 */

export const STRICTNESS_BOUNDS = {
  MIN_SLIDER: 1,
  MAX_SLIDER: 100,
  DEFAULT_SLIDER: 75,

  // Match Similarity Threshold (% similarity required to trigger reaction)
  // At strictness 1: triggers if similarity >= 70% (lenient)
  // At strictness 100: requires similarity >= 95% (strict/exact match)
  MATCH_MIN_THRESHOLD_PERCENT: 70.0,
  MATCH_MAX_THRESHOLD_PERCENT: 95.0,

  // Backward compatibility aliases
  CHANGE_MIN_DELTA_PERCENT: 70.0,
  CHANGE_MAX_DELTA_PERCENT: 95.0,
  MATCH_MAX_MISMATCH_PERCENT: 30.0,
  MATCH_MIN_MISMATCH_PERCENT: 5.0
};

export class StrictnessMapper {
  /**
   * Clamps strictness value to valid range [1, 100]
   * @param {number} val
   * @returns {number}
   */
  static clamp(val) {
    if (typeof val !== 'number' || Number.isNaN(val)) {
      return STRICTNESS_BOUNDS.DEFAULT_SLIDER;
    }
    return Math.max(STRICTNESS_BOUNDS.MIN_SLIDER, Math.min(STRICTNESS_BOUNDS.MAX_SLIDER, Math.round(val)));
  }

  /**
   * Maps slider value (1-100) to required match similarity threshold percentage
   * Formula: threshold = MIN + (MAX - MIN) * ((strictness - 1) / (100 - 1))
   * 
   * @param {number} strictness - Strictness setting (1 - 100)
   * @returns {number} Required match similarity percentage (e.g., 70.0% to 95.0%)
   */
  static mapToChangeDeltaThreshold(strictness) {
    const s = this.clamp(strictness);
    const range = STRICTNESS_BOUNDS.MATCH_MAX_THRESHOLD_PERCENT - STRICTNESS_BOUNDS.MATCH_MIN_THRESHOLD_PERCENT;
    const ratio = (s - STRICTNESS_BOUNDS.MIN_SLIDER) / (STRICTNESS_BOUNDS.MAX_SLIDER - STRICTNESS_BOUNDS.MIN_SLIDER);
    const threshold = STRICTNESS_BOUNDS.MATCH_MIN_THRESHOLD_PERCENT + (range * ratio);
    return Number(threshold.toFixed(2));
  }

  /**
   * Alias for match tolerance mapping
   */
  static mapToMatchTolerance(strictness) {
    const s = this.clamp(strictness);
    return Number((100.0 - this.mapToChangeDeltaThreshold(s)).toFixed(2));
  }

  /**
   * Returns a user-friendly explanatory description of what the current strictness value means
   * @param {number} strictness
   * @returns {{label: string, explanation: string, deltaThreshold: number}}
   */
  static describeStrictness(strictness) {
    const s = this.clamp(strictness);
    const threshold = this.mapToChangeDeltaThreshold(s);

    if (s >= 80) {
      return {
        label: 'High Strictness',
        explanation: `Requires a precise match to reference fingerprint (≥ ${threshold}% similarity). Ignores ambient background shifts.`,
        deltaThreshold: threshold
      };
    }
    if (s >= 40) {
      return {
        label: 'Balanced Strictness',
        explanation: `Standard match sensitivity (≥ ${threshold}% similarity). Recommended for game over banners and score badges.`,
        deltaThreshold: threshold
      };
    }
    return {
      label: 'Low Strictness',
      explanation: `High leniency (≥ ${threshold}% similarity). Triggers on broader visual similarity variations.`,
      deltaThreshold: threshold
    };
  }
}
