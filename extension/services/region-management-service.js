/**
 * Reactron Watch Region & Reaction Configuration Management Service
 * 
 * Responsibilities:
 * 1. Watch Region creation, removal, and normalized coordinate conversion.
 * 2. Reaction Configuration management (GIF, Text, or both).
 * 3. Configuration label generation policy:
 *    - Both reaction names provided: "Name1 | Name2"
 *    - One provided: "Name"
 *    - Neither provided: Generated display label ("Reaction 1", "Reaction 2")
 *    - Keeps generated labels separate from user-entered names.
 * 4. Atomic Save & Cancel preserving omitted sections without inventing fake content.
 */

import { GameIdentityService } from './game-identity-service.js';

export class RegionManagementService {
  /**
   * Generates a formatted display label for a Reaction Configuration
   * @param {import('../shared/types.js').ReactionConfig} config
   * @param {number} index - 0-based index in the region's configuration list
   * @returns {string} Formatted label
   */
  static formatConfigurationLabel(config, index = 0) {
    if (!config) return `Reaction ${index + 1}`;

    const gifName = (config.gifReaction?.enabled && config.gifReaction?.name?.trim()) || '';
    const textName = (config.textReaction?.enabled && config.textReaction?.name?.trim()) || '';

    // If both reaction names provided: join with vertical separator
    if (gifName && textName) {
      return `${gifName} | ${textName}`;
    }

    // If one is provided: use that name
    if (gifName) return gifName;
    if (textName) return textName;

    // Custom user title if present
    if (config.customTitle?.trim()) {
      return config.customTitle.trim();
    }

    // If neither is provided: generate display label
    return `Reaction ${index + 1}`;
  }

  /**
   * Creates a new blank Watch Region
   * @param {number} regionNumber
   * @returns {import('../shared/types.js').WatchRegion}
   */
  static createWatchRegion() {
    const regionId = GameIdentityService.generateRegionId();
    return {
      id: regionId,
      name: '',
      strictness: 75,
      geometry: null,
      previewUrl: null,
      reactionConfigs: [this.createReactionConfiguration(1)]
    };
  }

  /**
   * Creates a new Reaction Configuration
   * @param {number} configNumber
   * @returns {import('../shared/types.js').ReactionConfig}
   */
  static createReactionConfiguration(configNumber = 1) {
    const reactionId = GameIdentityService.generateReactionId();
    return {
      id: reactionId,
      customTitle: '',
      gifReaction: {
        enabled: true,
        name: 'Victory Explode',
        fileUrl: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 200 200"><circle cx="100" cy="100" r="80" fill="%23607DFA" fill-opacity="0.8"/><text x="100" y="108" text-anchor="middle" fill="white" font-size="20" font-family="sans-serif">💥 EXPLOSION</text></svg>',
        size: 180,
        delaySeconds: 0.5,
        durationSeconds: 3,
        saveToLibrary: false
      },
      textReaction: {
        enabled: true,
        name: 'Victory Text',
        text: '💥 BOSS CRUSHED!',
        fontSize: 32,
        fontColor: '#F4F6FA',
        fontType: 'impact',
        animationStyle: 'pop-in',
        delaySeconds: 0.0,
        durationSeconds: 3,
        saveToLibrary: false
      }
    };
  }

  /**
   * Converts client viewport pixel coordinates to normalized viewport ratios (0.0 to 1.0)
   * Ensures resolution independence across different window sizes and DPRs.
   * @param {{x: number, y: number, width: number, height: number}} pixelCoords
   * @param {number} viewportWidth
   * @param {number} viewportHeight
   * @returns {import('../shared/types.js').NormalizedGeometry}
   */
  static normalizeCoordinates(pixelCoords, viewportWidth, viewportHeight) {
    const vw = Math.max(viewportWidth, 1);
    const vh = Math.max(viewportHeight, 1);

    // Clamp coordinates inside content viewport (excluding scrollbars/browser chrome)
    const clampedX = Math.max(0, Math.min(pixelCoords.x, vw));
    const clampedY = Math.max(0, Math.min(pixelCoords.y, vh));
    const clampedW = Math.max(1, Math.min(pixelCoords.width, vw - clampedX));
    const clampedH = Math.max(1, Math.min(pixelCoords.height, vh - clampedY));

    return {
      x: Number((clampedX / vw).toFixed(4)),
      y: Number((clampedY / vh).toFixed(4)),
      width: Number((clampedW / vw).toFixed(4)),
      height: Number((clampedH / vh).toFixed(4)),
      viewportWidth: vw,
      viewportHeight: vh
    };
  }

  /**
   * Deep clones a reaction configuration to support atomic cancel without damaging last saved state
   * @param {import('../shared/types.js').ReactionConfig} config
   * @returns {import('../shared/types.js').ReactionConfig}
   */
  static cloneConfiguration(config) {
    return JSON.parse(JSON.stringify(config));
  }
}
