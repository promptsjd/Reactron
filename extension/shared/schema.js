/**
 * Reactron Authoritative Data Schema & Migration Engine (Stage 4)
 * 
 * Documented Schema Definition:
 * -------------------------------------------------------------
 * Storage separation:
 * 1. Structured metadata & records -> Chrome Storage Local (keyed by entity store)
 * 2. High-volume binary media (GIFs, PNGs, JPEGs) -> IndexedDB ('reactron_media_store')
 * 
 * Entity Relationships:
 * Game (1) --------< WatchRegion (N)
 * WatchRegion (1) -< ReactionConfig (N)
 * ReactionConfig has [0..1] GifReaction (references MediaAsset in IndexedDB)
 * ReactionConfig has [0..1] TextReaction
 * LibraryPreset is independent (may reference MediaAsset)
 */

export const SCHEMA_VERSION = 2;

export const STORAGE_KEYS = {
  SCHEMA_VERSION: 'reactron_schema_version',
  GAMES: 'reactron_games_store',
  LIBRARY_PRESETS: 'reactron_library_presets_store',
  LAST_CAPTURED_REGION: 'reactron_last_captured_region'
};

const LEGACY_SAMPLE_PRESET_IDS = new Set(['lib_lib-g-1', 'lib_lib-t-1', 'lib-g-1', 'lib-t-1']);

/**
 * Migration Registry
 * Defines migrations to upgrade database safely between versions.
 */
export const MIGRATIONS = [
  {
    version: 1,
    description: 'Initial relational schema setup with stable UUIDs and separated stores',
    up: (data) => {
      // Ensures all collections exist and have schema v1 structure
      return {
        games: Array.isArray(data.games) ? data.games : [],
        regions: Array.isArray(data.regions) ? data.regions : [],
        configs: Array.isArray(data.configs) ? data.configs : [],
        libraryPresets: Array.isArray(data.libraryPresets) ? data.libraryPresets : []
      };
    }
  },
  {
    version: 2,
    description: 'Remove seeded sample library presets so library contains only user-saved reactions',
    up: (data) => {
      const presets = Array.isArray(data.libraryPresets)
        ? data.libraryPresets.filter((p) => p && !LEGACY_SAMPLE_PRESET_IDS.has(p.id))
        : [];
      return {
        games: Array.isArray(data.games) ? data.games : [],
        libraryPresets: presets
      };
    }
  }
];

/**
 * Schema Validation Helpers
 */
export class SchemaValidator {
  /**
   * Validates a Game record
   * @param {any} game
   * @returns {{isValid: boolean, error?: string}}
   */
  static validateGame(game) {
    if (!game || typeof game !== 'object') {
      return { isValid: false, error: 'Invalid game entity: must be an object' };
    }
    if (!game.id || typeof game.id !== 'string') {
      return { isValid: false, error: 'Game missing stable internal ID' };
    }
    if (!game.name || typeof game.name !== 'string' || game.name.trim().length === 0) {
      return { isValid: false, error: 'Game name is required' };
    }
    if (game.name.trim().length > 15) {
      return { isValid: false, error: 'Game name cannot exceed 15 characters' };
    }
    if (!game.url || typeof game.url !== 'string') {
      return { isValid: false, error: 'Game missing URL' };
    }
    return { isValid: true };
  }

  /**
   * Validates a Watch Region record
   * @param {any} region
   * @returns {{isValid: boolean, error?: string}}
   */
  static validateRegion(region, expectedGameId = null) {
    if (!region || typeof region !== 'object') {
      return { isValid: false, error: 'Invalid region entity: must be an object' };
    }
    if (!region.id || typeof region.id !== 'string') {
      return { isValid: false, error: 'Watch Region missing stable ID' };
    }
    const gameId = region.gameId || expectedGameId;
    if (!gameId || typeof gameId !== 'string') {
      return { isValid: false, error: 'Watch Region missing parent Game ID reference' };
    }
    if (typeof region.strictness !== 'number' || region.strictness < 1 || region.strictness > 100) {
      return { isValid: false, error: 'Strictness must be a number between 1 and 100' };
    }
    return { isValid: true };
  }

  /**
   * Validates a Reaction Configuration record
   * @param {any} config
   * @param {string} [expectedRegionId]
   * @returns {{isValid: boolean, error?: string}}
   */
  static validateReactionConfig(config, expectedRegionId = null) {
    if (!config || typeof config !== 'object') {
      return { isValid: false, error: 'Invalid reaction config entity: must be an object' };
    }
    if (!config.id || typeof config.id !== 'string') {
      return { isValid: false, error: 'Reaction configuration missing stable ID' };
    }
    const regionId = config.regionId || expectedRegionId;
    if (!regionId || typeof regionId !== 'string') {
      return { isValid: false, error: 'Reaction configuration missing parent Region ID reference' };
    }
    return { isValid: true };
  }

  /**
   * Validates a Library Preset record
   * @param {any} preset
   * @returns {{isValid: boolean, error?: string}}
   */
  static validateLibraryPreset(preset) {
    if (!preset || typeof preset !== 'object') {
      return { isValid: false, error: 'Invalid preset entity: must be an object' };
    }
    if (!preset.id || typeof preset.id !== 'string') {
      return { isValid: false, error: 'Preset missing stable ID' };
    }
    if (preset.type !== 'gif' && preset.type !== 'text') {
      return { isValid: false, error: 'Preset type must be either "gif" or "text"' };
    }
    if (!preset.name || typeof preset.name !== 'string' || preset.name.trim().length === 0) {
      return { isValid: false, error: 'Preset name is required' };
    }
    if (preset.name.trim().length > 15) {
      return { isValid: false, error: 'Preset name cannot exceed 15 characters' };
    }
    return { isValid: true };
  }
}
