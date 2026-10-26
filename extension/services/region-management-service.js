/**
 * Reactron Watch Region & Reaction Configuration Management Service
 * 
 * Responsibilities:
 * 1. Watch Region creation and removal.
 * 2. Reaction Configuration management (GIF or Text).
 * 3. Configuration label generation ("Reaction 1", "Reaction 2").
 * 4. Atomic Save & Cancel preserving omitted sections without inventing fake content.
 */

import { GameIdentityService } from './game-identity-service.js';
import { REACTION_CONFIG_CONSTANTS, WATCH_REGION_CONSTANTS } from '../shared/types.js';

export class RegionManagementService {
  /**
   * Generates a formatted display label for a Watch Region's area selection button
   * Uses centralized naming rule ("Select Area 1", "Reselect Area 1", "Select Area 2", etc.)
   * @param {import('../shared/types.js').WatchRegion} region
   * @param {number} [index=0] - 0-based index in the game's watchRegions list
   * @returns {string}
   */
  static formatRegionSelectLabel(region, index = 0) {
    const prefix = region?.previewUrl
      ? WATCH_REGION_CONSTANTS.RESELECT_LABEL_PREFIX
      : WATCH_REGION_CONSTANTS.SELECT_LABEL_PREFIX;
    return `${prefix} ${index + 1}`;
  }

  /**
   * Checks whether a Watch Region has completed the setup journey
   * (has a captured area and at least one saved reaction configuration)
   * @param {import('../shared/types.js').WatchRegion} region
   * @returns {boolean}
   */
  static isRegionConfigured(region) {
    if (!region || !region.previewUrl || !region.geometry) {
      return false;
    }
    if (!Array.isArray(region.reactionConfigs)) {
      return false;
    }
    return region.reactionConfigs.some(
      (cfg) =>
        cfg &&
        !cfg._isUnsavedDraft &&
        Boolean(cfg.type || cfg.gifReaction?.enabled || cfg.textReaction?.enabled)
    );
  }

  /**
   * Checks whether the game can accept another Watch Region
   * Requires existing region(s) to be configured and total count < MAX_REGIONS_PER_GAME
   * @param {Array<import('../shared/types.js').WatchRegion>} watchRegions
   * @returns {boolean}
   */
  static canAddRegion(watchRegions) {
    if (!Array.isArray(watchRegions) || watchRegions.length === 0) {
      return false;
    }
    if (watchRegions.length >= WATCH_REGION_CONSTANTS.MAX_REGIONS_PER_GAME) {
      return false;
    }
    return watchRegions.every((r) => RegionManagementService.isRegionConfigured(r));
  }

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
   * Clears captured preview and geometry from a watch region
   * @param {import('../shared/types.js').WatchRegion} region
   */
  static clearRegionArea(region) {
    if (!region) return;
    region.previewUrl = null;
    region.geometry = null;
  }

  /**
   * Removes a reaction configuration by ID from a watch region
   * @param {import('../shared/types.js').WatchRegion} region
   * @param {string} reactionId
   */
  static removeReactionConfiguration(region, reactionId) {
    if (!region || !Array.isArray(region.reactionConfigs)) return;
    region.reactionConfigs = region.reactionConfigs.filter((c) => c.id !== reactionId);
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
