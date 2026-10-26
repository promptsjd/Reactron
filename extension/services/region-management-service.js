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
import { REACTION_CONFIG_CONSTANTS } from '../shared/types.js';

export class RegionManagementService {
  /**
   * Generates a formatted display label for a Reaction Configuration
   * Uses centralized naming rule ("Reaction 1", "Reaction 2") without requiring user-entered names.
   * @param {import('../shared/types.js').ReactionConfig} config
   * @param {number} index - 0-based index in the region's configuration list
   * @returns {string} Formatted label
   */
  static formatConfigurationLabel(config, index = 0) {
    return `${REACTION_CONFIG_CONSTANTS.LABEL_PREFIX} ${index + 1}`;
  }

  /**
   * Checks whether a region can accept another reaction configuration
   * @param {import('../shared/types.js').WatchRegion} region
   * @returns {boolean}
   */
  static canAddReaction(region) {
    const count = Array.isArray(region?.reactionConfigs) ? region.reactionConfigs.length : 0;
    return count < REACTION_CONFIG_CONSTANTS.MAX_REACTIONS_PER_REGION;
  }

  /**
   * Creates a new blank Watch Region with parent gameId link
   * @param {string} [gameId]
   * @returns {import('../shared/types.js').WatchRegion}
   */
  static createWatchRegion(gameId = null) {
    const regionId = GameIdentityService.generateRegionId();
    return {
      id: regionId,
      ...(gameId ? { gameId } : {}),
      name: '',
      strictness: 75,
      geometry: null,
      previewUrl: null,
      reactionConfigs: []
    };
  }

  /**
   * Creates a new single-type Reaction Configuration with parent regionId link and filler defaults
   * @param {number} [configNumber=1]
   * @param {string} [regionId=null]
   * @param {'gif'|'text'|null} [initialType=null]
   * @returns {import('../shared/types.js').ReactionConfig}
   */
  static createReactionConfiguration(configNumber = 1, regionId = null, initialType = null) {
    const reactionId = GameIdentityService.generateReactionId();
    const label = `${REACTION_CONFIG_CONSTANTS.LABEL_PREFIX} ${configNumber}`;
    const gifFiller = REACTION_CONFIG_CONSTANTS.FILLER_DEFAULTS.GIF;
    const textFiller = REACTION_CONFIG_CONSTANTS.FILLER_DEFAULTS.TEXT;

    return {
      id: reactionId,
      ...(regionId ? { regionId } : {}),
      type: initialType,
      customTitle: '',
      gifReaction: {
        enabled: initialType === REACTION_CONFIG_CONSTANTS.TYPES.GIF,
        name: label,
        fileUrl: gifFiller.fileUrl,
        fileName: gifFiller.fileName,
        size: gifFiller.size,
        delaySeconds: gifFiller.delaySeconds,
        durationSeconds: gifFiller.durationSeconds,
        saveToLibrary: false,
        position: { ...gifFiller.position }
      },
      textReaction: {
        enabled: initialType === REACTION_CONFIG_CONSTANTS.TYPES.TEXT,
        name: label,
        text: textFiller.text,
        fontSize: textFiller.fontSize,
        fontColor: textFiller.fontColor,
        fontType: textFiller.fontType,
        animationStyle: textFiller.animationStyle,
        delaySeconds: textFiller.delaySeconds,
        durationSeconds: textFiller.durationSeconds,
        saveToLibrary: false,
        position: { ...textFiller.position }
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
