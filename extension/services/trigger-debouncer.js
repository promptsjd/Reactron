/**
 * Reactron Trigger Debouncer & Cooldown Manager (Stage 5)
 * 
 * Responsibilities:
 * 1. Prevents uncontrolled repeated triggers when a visual change persists continuously.
 * 2. Enforces a configurable cooldown period (e.g. 3000ms) between reaction triggers.
 * 3. Distinguishes:
 *    - New visual event (edge transition: IDLE -> TRIGGERED)
 *    - Sustained visual event (game stays in trigger state -> SUSTAINED / COOLDOWN, no spam)
 *    - Event disappearance (state returns below threshold -> RE_ARMED)
 *    - Repeated events (event occurs, disappears, occurs again -> triggers again cleanly)
 */

export const DEBOUNCER_STATES = {
  IDLE: 'IDLE',
  TRIGGERED: 'TRIGGERED',
  SUSTAINED: 'SUSTAINED',
  COOLDOWN: 'COOLDOWN'
};

export const DEBOUNCER_DEFAULTS = {
  COOLDOWN_MS: 3000,
  HYSTERESIS_FACTOR: 0.85 // Delta must fall below (threshold * hysteresis) to re-arm, preventing boundary jitter
};

export class TriggerDebouncer {
  /**
   * @param {Object} [options]
   * @param {number} [options.cooldownMs=3000]
   * @param {number} [options.hysteresisFactor=0.85]
   */
  constructor(options = {}) {
    this.cooldownMs = options.cooldownMs ?? DEBOUNCER_DEFAULTS.COOLDOWN_MS;
    this.hysteresisFactor = options.hysteresisFactor ?? DEBOUNCER_DEFAULTS.HYSTERESIS_FACTOR;

    this.state = DEBOUNCER_STATES.IDLE;
    this.lastTriggerTimestamp = 0;
    this.lastDelta = 0;
    this.triggerCount = 0;
    this.isArmed = true;
  }

  /**
   * Evaluates the current sample delta against the threshold.
   * 
   * @param {number} currentDelta - Current measured visual change % (0 to 100)
   * @param {number} threshold - Required delta threshold % for triggering
   * @param {number} [currentTime=Date.now()]
   * @returns {{
   *   shouldTrigger: boolean,
   *   state: string,
   *   reason: string,
   *   isArmed: boolean,
   *   cooldownRemainingMs: number
   * }}
   */
  evaluate(currentDelta, threshold, currentTime = Date.now()) {
    this.lastDelta = currentDelta;
    const timeSinceLastTrigger = currentTime - this.lastTriggerTimestamp;
    const isAboveThreshold = currentDelta >= threshold;
    const releaseThreshold = threshold * this.hysteresisFactor;
    const isBelowRelease = currentDelta < releaseThreshold;

    const cooldownRemainingMs = this.lastTriggerTimestamp > 0
      ? Math.max(0, this.cooldownMs - timeSinceLastTrigger)
      : 0;
    const inCooldown = this.lastTriggerTimestamp > 0 && cooldownRemainingMs > 0;

    // State 1: Condition cleared below hysteresis threshold -> Re-arm
    if (isBelowRelease) {
      if (!this.isArmed) {
        this.isArmed = true;
      }
      if (!inCooldown) {
        this.state = DEBOUNCER_STATES.IDLE;
      } else {
        this.state = DEBOUNCER_STATES.COOLDOWN;
      }

      return {
        shouldTrigger: false,
        state: this.state,
        reason: 'Delta below trigger threshold; watcher armed',
        isArmed: this.isArmed,
        cooldownRemainingMs
      };
    }

    // State 2: Above threshold, but still in cooldown from a recent trigger
    if (inCooldown) {
      this.state = DEBOUNCER_STATES.COOLDOWN;
      return {
        shouldTrigger: false,
        state: DEBOUNCER_STATES.COOLDOWN,
        reason: `Trigger suppressed: active cooldown (${cooldownRemainingMs}ms remaining)`,
        isArmed: this.isArmed,
        cooldownRemainingMs
      };
    }

    // State 3: Above threshold and cooldown elapsed, but condition never cleared (sustained state)
    // Reactron requires the visual change to clear before re-triggering, preventing infinite loops
    // on a permanent game state (e.g., game over screen remaining indefinitely)
    if (!this.isArmed) {
      this.state = DEBOUNCER_STATES.SUSTAINED;
      return {
        shouldTrigger: false,
        state: DEBOUNCER_STATES.SUSTAINED,
        reason: 'Trigger suppressed: sustained visual change must clear before re-arming',
        isArmed: false,
        cooldownRemainingMs: 0
      };
    }

    // State 4: Above threshold, cooled down, and armed -> FIRE!
    if (isAboveThreshold && this.isArmed) {
      this.state = DEBOUNCER_STATES.TRIGGERED;
      this.lastTriggerTimestamp = currentTime;
      this.isArmed = false; // Disarm until condition drops below release threshold
      this.triggerCount++;

      return {
        shouldTrigger: true,
        state: DEBOUNCER_STATES.TRIGGERED,
        reason: `Valid trigger: delta ${currentDelta}% exceeds threshold ${threshold}%`,
        isArmed: false,
        cooldownRemainingMs: this.cooldownMs
      };
    }

    return {
      shouldTrigger: false,
      state: this.state,
      reason: 'No trigger condition met',
      isArmed: this.isArmed,
      cooldownRemainingMs
    };
  }

  /**
   * Resets the debouncer to initial armed idle state
   */
  reset() {
    this.state = DEBOUNCER_STATES.IDLE;
    this.lastTriggerTimestamp = 0;
    this.lastDelta = 0;
    this.triggerCount = 0;
    this.isArmed = true;
  }
}
