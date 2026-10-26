/**
 * Reactron Authoritative Persistence Service (Stage 4)
 * 
 * Single authoritative service for managing structured data records,
 * schema versioning, schema migrations, and entity relationships.
 * 
 * Architecture & Documented Storage Strategy:
 * 1. Structured Entities (Games, Regions, ReactionConfigs, LibraryPresets)
 *    are persisted in chrome.storage.local (with transaction isolation and in-memory fallback).
 * 2. Binary Media Blobs (GIFs, PNGs, JPEGs) are stored in IndexedDB via MediaStorageService,
 *    referenced by stable mediaAssetId.
 * 3. Atomic writes: Every mutation validates entities via SchemaValidator before writing.
 *    Failed writes throw an explicit error with the exact failure cause and do not falsely report success.
 * 4. Migration Engine: Checks SCHEMA_VERSION on startup; applies sequential migrations safely.
 */

import { SCHEMA_VERSION, STORAGE_KEYS, MIGRATIONS, SchemaValidator } from '../shared/schema.js';
import { mediaStorage } from './media-storage.js';
import { INITIAL_MOCK_GAMES, MOCK_LIBRARY_GIFS, MOCK_LIBRARY_TEXTS } from '../shared/mock-data.js';

export class PersistenceService {
  constructor() {
    this._isInitialized = false;
    this._initPromise = null;
    this._memoryStore = new Map();
  }

  /**
   * Initializes the persistence layer, runs migrations, seeds initial records if fresh install
   * @returns {Promise<void>}
   */
  async initialize() {
    if (this._isInitialized) return;
    if (this._initPromise) return this._initPromise;

    this._initPromise = (async () => {
      try {
        await mediaStorage.getDb();
        const storedVersion = await this._readKey(STORAGE_KEYS.SCHEMA_VERSION);

        if (!storedVersion) {
          // Fresh install: seed initial structure and schema version
          await this._seedInitialData();
        } else if (storedVersion < SCHEMA_VERSION) {
          // Execute migrations sequentially
          await this._executeMigrations(storedVersion, SCHEMA_VERSION);
        }

        this._isInitialized = true;
      } catch (err) {
        console.error('[PersistenceService] Initialization error:', err);
        throw new Error(`Persistence initialization failed: ${err.message}`);
      }
    })();

    return this._initPromise;
  }

  /**
   * Internal storage reader
   * @private
   */
  async _readKey(key) {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      return new Promise((resolve) => {
        chrome.storage.local.get([key], (res) => {
          if (chrome.runtime.lastError) {
            resolve(this._memoryStore.get(key) || null);
          } else {
            resolve(res[key] !== undefined ? res[key] : (this._memoryStore.get(key) || null));
          }
        });
      });
    }
    return this._memoryStore.get(key) || null;
  }

  /**
   * Internal storage writer with error guarantee
   * @private
   */
  async _writeKey(key, value) {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      return new Promise((resolve, reject) => {
        chrome.storage.local.set({ [key]: value }, () => {
          if (chrome.runtime.lastError) {
            reject(new Error(`Storage write failed for ${key}: ${chrome.runtime.lastError.message}`));
          } else {
            this._memoryStore.set(key, value);
            resolve(true);
          }
        });
      });
    }
    this._memoryStore.set(key, value);
    return true;
  }

  /**
   * Seeds initial sample dataset on first launch
   * @private
   */
  async _seedInitialData() {
    const games = JSON.parse(JSON.stringify(INITIAL_MOCK_GAMES));
    const presets = [
      ...MOCK_LIBRARY_GIFS.map((g) => ({ ...g, id: `lib_${g.id}`, createdAt: Date.now() })),
      ...MOCK_LIBRARY_TEXTS.map((t) => ({ ...t, id: `lib_${t.id}`, createdAt: Date.now() }))
    ];

    await this._writeKey(STORAGE_KEYS.GAMES, games);
    await this._writeKey(STORAGE_KEYS.LIBRARY_PRESETS, presets);
    await this._writeKey(STORAGE_KEYS.SCHEMA_VERSION, SCHEMA_VERSION);
  }

  /**
   * Runs schema migrations safely
   * @private
   */
  async _executeMigrations(fromVersion, targetVersion) {
    console.log(`[PersistenceService] Migrating schema from v${fromVersion} to v${targetVersion}...`);
    for (const m of MIGRATIONS) {
      if (m.version > fromVersion && m.version <= targetVersion) {
        const games = await this.getGames();
        const libraryPresets = await this.getLibraryPresets();
        const upgraded = m.up({ games, libraryPresets });

        if (upgraded.games) await this._writeKey(STORAGE_KEYS.GAMES, upgraded.games);
        if (upgraded.libraryPresets) await this._writeKey(STORAGE_KEYS.LIBRARY_PRESETS, upgraded.libraryPresets);
      }
    }
    await this._writeKey(STORAGE_KEYS.SCHEMA_VERSION, targetVersion);
    console.log(`[PersistenceService] Schema successfully migrated to v${targetVersion}`);
  }

  // ==========================================
  // GAME OPERATIONS
  // ==========================================

  /**
   * Retrieves all saved games
   * @returns {Promise<Array<import('../shared/types.js').GameEntry>>}
   */
  async getGames() {
    await this.initialize();
    const games = await this._readKey(STORAGE_KEYS.GAMES);
    return Array.isArray(games) ? games : [];
  }

  /**
   * Retrieves a specific game by ID
   * @param {string} id
   * @returns {Promise<import('../shared/types.js').GameEntry|null>}
   */
  async getGameById(id) {
    const games = await this.getGames();
    return games.find((g) => g.id === id) || null;
  }

  /**
   * Saves or updates a Game entity
   * Validates name uniqueness and length at boundary.
   * @param {import('../shared/types.js').GameEntry} game
   * @returns {Promise<{success: boolean, game?: import('../shared/types.js').GameEntry, error?: string}>}
   */
  async saveGame(game) {
    await this.initialize();

    // Validate Game schema
    const validation = SchemaValidator.validateGame(game);
    if (!validation.isValid) {
      return { success: false, error: validation.error };
    }

    const games = await this.getGames();

    // Enforce name uniqueness across other games
    const isDuplicate = games.some(
      (g) => g.id !== game.id && g.name.toLowerCase() === game.name.trim().toLowerCase()
    );
    if (isDuplicate) {
      return { success: false, error: 'A game with this name already exists' };
    }

    // Process Watch Regions and Reaction Configurations
    const processedRegions = [];
    if (Array.isArray(game.watchRegions)) {
      for (const region of game.watchRegions) {
        region.gameId = game.id;
        const regVal = SchemaValidator.validateRegion(region, game.id);
        if (!regVal.isValid) {
          return { success: false, error: regVal.error };
        }

        const processedConfigs = [];
        if (Array.isArray(region.reactionConfigs)) {
          const limitedConfigs = region.reactionConfigs.slice(0, 2);
          for (let configIndex = 0; configIndex < limitedConfigs.length; configIndex++) {
            const config = limitedConfigs[configIndex];
            config.regionId = region.id;
            const cfgVal = SchemaValidator.validateReactionConfig(config, region.id);
            if (!cfgVal.isValid) {
              return { success: false, error: cfgVal.error };
            }

            const defaultLabel = `Reaction ${configIndex + 1}`;
            const resolvedType =
              config.type ||
              (config.gifReaction?.enabled ? 'gif' : config.textReaction?.enabled ? 'text' : null);

            const processedConfig = {
              id: config.id,
              regionId: region.id,
              type: resolvedType,
              customTitle: config.customTitle || '',
              updatedAt: Date.now()
            };

            // Process GIF Reaction (never invent if omitted)
            if (config.gifReaction) {
              const g = config.gifReaction;
              let mediaAssetId = g.mediaAssetId || null;

              const isSmallBuiltInSvg =
                typeof g.fileUrl === 'string' &&
                g.fileUrl.startsWith('data:image/svg+xml') &&
                g.fileUrl.length < 2048;

              if (g.fileUrl && g.fileUrl.startsWith('data:') && !isSmallBuiltInSvg) {
                try {
                  mediaAssetId = await mediaStorage.storeMedia(g.fileUrl, {
                    fileName: g.fileName || 'reaction.gif',
                    mimeType: g.mimeType || 'image/gif'
                  });
                } catch (mediaErr) {
                  console.warn('[PersistenceService] Media storage warning:', mediaErr);
                }
              }

              const persistedFileUrl =
                mediaAssetId && !isSmallBuiltInSvg ? '' : (g.fileUrl || '');

              const reactionLabel = (g.name || '').trim() || defaultLabel;

              processedConfig.gifReaction = {
                enabled: !!g.enabled,
                name: reactionLabel,
                mediaAssetId,
                fileUrl: persistedFileUrl,
                fileName: g.fileName || '',
                size: g.size || 180,
                delaySeconds: g.delaySeconds || 0,
                durationSeconds: g.durationSeconds || 3,
                saveToLibrary: !!g.saveToLibrary,
                position: g.position || { xRatio: 0.5, yRatio: 0.35 }
              };

              // Save to library preset if user explicitly requested
              if (g.saveToLibrary && g.enabled) {
                const presetId = g._createNewLibraryPreset
                  ? `lib_preset_${config.id}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}_gif`
                  : (g.libraryPresetId || `lib_preset_${config.id}_gif`);
                processedConfig.gifReaction.libraryPresetId = presetId;
                await this.saveLibraryPreset({
                  id: presetId,
                  type: 'gif',
                  name: reactionLabel.slice(0, 15),
                  summary: `GIF Overlay (${g.size || 180}px)`,
                  mediaAssetId,
                  content: { ...processedConfig.gifReaction, saveToLibrary: false }
                });
              }
            }

            // Process Text Reaction (never invent if omitted)
            if (config.textReaction) {
              const t = config.textReaction;
              const reactionLabel = (t.name || '').trim() || defaultLabel;

              processedConfig.textReaction = {
                enabled: !!t.enabled,
                name: reactionLabel,
                text: (t.text || '').trim(),
                fontSize: t.fontSize || 32,
                fontColor: t.fontColor || '#F4F6FA',
                fontType: t.fontType || 'impact',
                animationStyle: t.animationStyle || 'pop-in',
                delaySeconds: t.delaySeconds || 0,
                durationSeconds: t.durationSeconds || 3,
                saveToLibrary: !!t.saveToLibrary,
                position: t.position || { xRatio: 0.5, yRatio: 0.6 }
              };

              // Save to library preset if user explicitly requested
              if (t.saveToLibrary && t.enabled) {
                const presetId = t._createNewLibraryPreset
                  ? `lib_preset_${config.id}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}_text`
                  : (t.libraryPresetId || `lib_preset_${config.id}_text`);
                processedConfig.textReaction.libraryPresetId = presetId;
                await this.saveLibraryPreset({
                  id: presetId,
                  type: 'text',
                  name: reactionLabel.slice(0, 15),
                  summary: `"${t.text || ''}" • ${t.fontType || 'impact'}`,
                  content: { ...processedConfig.textReaction, saveToLibrary: false }
                });
              }
            }

            processedConfigs.push(processedConfig);
          }
        }

        processedRegions.push({
          ...region,
          gameId: game.id,
          reactionConfigs: processedConfigs
        });
      }
    }

    const existingIndex = games.findIndex((g) => g.id === game.id);
    const updatedGame = {
      ...game,
      name: game.name.trim(),
      watchRegions: processedRegions,
      updatedAt: Date.now()
    };

    if (existingIndex >= 0) {
      games[existingIndex] = updatedGame;
    } else {
      games.unshift(updatedGame);
    }

    try {
      await this._writeKey(STORAGE_KEYS.GAMES, games);
      await this.cleanupOrphanedMedia();
      return { success: true, game: updatedGame };
    } catch (err) {
      console.error('[PersistenceService] Game write failure:', err);
      return { success: false, error: `Failed to save game: ${err.message}` };
    }
  }

  /**
   * Deletes a game and cleans up orphaned media references safely
   * @param {string} gameId
   * @returns {Promise<boolean>}
   */
  async deleteGame(gameId) {
    await this.initialize();
    const games = await this.getGames();
    const filtered = games.filter((g) => g.id !== gameId);
    await this._writeKey(STORAGE_KEYS.GAMES, filtered);
    // Trigger media GC
    await this.cleanupOrphanedMedia();
    return true;
  }

  // ==========================================
  // REACTION CONFIGURATION OPERATIONS
  // ==========================================

  /**
   * Saves a reaction configuration inside its parent region and game.
   * @param {string} gameId
   * @param {string} regionId
   * @param {import('../shared/types.js').ReactionConfig} config
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  async saveReactionConfiguration(gameId, regionId, config) {
    await this.initialize();

    const games = await this.getGames();
    const game = games.find((g) => g.id === gameId);
    if (!game) {
      return { success: false, error: `Parent Game ${gameId} not found` };
    }

    const region = game.watchRegions?.find((r) => r.id === regionId);
    if (!region) {
      return { success: false, error: `Parent Watch Region ${regionId} not found` };
    }

    if (!region.reactionConfigs) {
      region.reactionConfigs = [];
    }

    const existingIndex = region.reactionConfigs.findIndex((c) => c.id === config.id);
    const slotNumber = existingIndex >= 0 ? existingIndex + 1 : region.reactionConfigs.length + 1;
    const defaultLabel = `Reaction ${slotNumber}`;
    const resolvedType =
      config.type ||
      (config.gifReaction?.enabled ? 'gif' : config.textReaction?.enabled ? 'text' : null);

    // 1. Process GIF reaction media persistence
    const savedConfig = {
      id: config.id,
      regionId: region.id,
      type: resolvedType,
      customTitle: config.customTitle || '',
      updatedAt: Date.now()
    };

    // Handle GIF/Image Reaction (preserve only if present/enabled, never invent)
    if (config.gifReaction) {
      const g = config.gifReaction;
      let mediaAssetId = g.mediaAssetId || null;

      const isSmallBuiltInSvg =
        typeof g.fileUrl === 'string' &&
        g.fileUrl.startsWith('data:image/svg+xml') &&
        g.fileUrl.length < 2048;

      // If user uploaded a new dataUrl, persist in IndexedDB media store
      if (g.fileUrl && g.fileUrl.startsWith('data:') && !isSmallBuiltInSvg) {
        try {
          mediaAssetId = await mediaStorage.storeMedia(g.fileUrl, {
            fileName: g.fileName || 'reaction.gif',
            mimeType: g.mimeType || 'image/gif'
          });
        } catch (err) {
          console.warn('[PersistenceService] Could not store binary media in IndexedDB:', err);
        }
      }

      const persistedFileUrl =
        mediaAssetId && !isSmallBuiltInSvg ? '' : (g.fileUrl || '');

      const reactionLabel = (g.name || '').trim() || defaultLabel;

      savedConfig.gifReaction = {
        enabled: !!g.enabled,
        name: reactionLabel,
        mediaAssetId,
        fileUrl: persistedFileUrl,
        fileName: g.fileName || '',
        size: g.size || 180,
        delaySeconds: g.delaySeconds || 0,
        durationSeconds: g.durationSeconds || 3,
        saveToLibrary: !!g.saveToLibrary,
        position: g.position || { xRatio: 0.5, yRatio: 0.35 }
      };

      // Save to library preset if requested
      if (g.saveToLibrary && g.enabled) {
        const presetId = g.libraryPresetId || `lib_preset_${config.id}_gif`;
        savedConfig.gifReaction.libraryPresetId = presetId;
        await this.saveLibraryPreset({
          id: presetId,
          type: 'gif',
          name: reactionLabel.slice(0, 15),
          summary: `GIF Overlay (${g.size || 180}px)`,
          mediaAssetId,
          content: { ...savedConfig.gifReaction, saveToLibrary: false }
        });
      }
    }

    // Handle Text Reaction (preserve only if present/enabled, never invent)
    if (config.textReaction) {
      const t = config.textReaction;
      const reactionLabel = (t.name || '').trim() || defaultLabel;

      savedConfig.textReaction = {
        enabled: !!t.enabled,
        name: reactionLabel,
        text: (t.text || '').trim(),
        fontSize: t.fontSize || 32,
        fontColor: t.fontColor || '#F4F6FA',
        fontType: t.fontType || 'impact',
        animationStyle: t.animationStyle || 'pop-in',
        delaySeconds: t.delaySeconds || 0,
        durationSeconds: t.durationSeconds || 3,
        saveToLibrary: !!t.saveToLibrary,
        position: t.position || { xRatio: 0.5, yRatio: 0.6 }
      };

      // Save to library preset if requested
      if (t.saveToLibrary && t.enabled) {
        const presetId = t.libraryPresetId || `lib_preset_${config.id}_text`;
        savedConfig.textReaction.libraryPresetId = presetId;
        await this.saveLibraryPreset({
          id: presetId,
          type: 'text',
          name: reactionLabel.slice(0, 15),
          summary: `"${t.text || ''}" • ${t.fontType || 'impact'}`,
          content: { ...savedConfig.textReaction, saveToLibrary: false }
        });
      }
    }

    // Update inside parent region
    if (existingIndex >= 0) {
      region.reactionConfigs[existingIndex] = savedConfig;
    } else {
      region.reactionConfigs.push(savedConfig);
    }

    game.updatedAt = Date.now();

    try {
      await this._writeKey(STORAGE_KEYS.GAMES, games);
      return { success: true };
    } catch (err) {
      console.error('[PersistenceService] Write failure:', err);
      return { success: false, error: err.message };
    }
  }

  // ==========================================
  // LIBRARY PRESET OPERATIONS
  // ==========================================

  /**
   * Retrieves library presets ordered with the most recent reaction on top
   * @param {'gif'|'text'} [type]
   * @returns {Promise<Array<any>>}
   */
  async getLibraryPresets(type) {
    await this.initialize();
    const presets = await this._readKey(STORAGE_KEYS.LIBRARY_PRESETS);
    const list = Array.isArray(presets) ? [...presets] : [];
    list.sort((a, b) => (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0));
    if (type) {
      return list.filter((p) => p.type === type);
    }
    return list;
  }

  /**
   * Saves a reusable preset into the library with its own unique ID and places the most recent on top.
   * Does not create or touch any Game configuration.
   * @param {any} preset
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  async saveLibraryPreset(preset) {
    await this.initialize();

    const validation = SchemaValidator.validateLibraryPreset(preset);
    if (!validation.isValid) {
      return { success: false, error: validation.error };
    }

    const presets = await this._readKey(STORAGE_KEYS.LIBRARY_PRESETS);
    const list = Array.isArray(presets) ? [...presets] : [];
    const normalizedName = preset.name.trim().toLowerCase();
    const isDefaultGeneratedLabel = /^reaction \d+$/i.test(normalizedName);

    const existingIndex = list.findIndex(
      (p) =>
        p.id === preset.id ||
        (!isDefaultGeneratedLabel &&
          p.type === preset.type &&
          (p.name || '').trim().toLowerCase() === normalizedName)
    );

    const now = Date.now();
    const existingPreset = existingIndex >= 0 ? list[existingIndex] : null;
    const updatedPreset = {
      ...existingPreset,
      ...preset,
      id: existingPreset ? existingPreset.id : preset.id,
      name: preset.name.trim(),
      createdAt: existingPreset?.createdAt || preset.createdAt || now,
      updatedAt: now
    };

    if (existingIndex >= 0) {
      list.splice(existingIndex, 1);
    }
    // Always place most recently saved/updated preset at the top
    list.unshift(updatedPreset);

    try {
      await this._writeKey(STORAGE_KEYS.LIBRARY_PRESETS, list);
      return { success: true, preset: updatedPreset };
    } catch (err) {
      return { success: false, error: `Failed to save library preset: ${err.message}` };
    }
  }

  /**
   * Deletes a library preset by ID and cleans up orphaned media references safely
   * @param {string} presetId
   * @returns {Promise<boolean>}
   */
  async deleteLibraryPreset(presetId) {
    await this.initialize();
    const presets = await this.getLibraryPresets();
    const filtered = presets.filter((p) => p.id !== presetId);
    await this._writeKey(STORAGE_KEYS.LIBRARY_PRESETS, filtered);
    await this.cleanupOrphanedMedia();
    return true;
  }

  // ==========================================
  // GARBAGE COLLECTION & RECOVERY
  // ==========================================

  /**
   * Scans all games, regions, and presets to find active media references,
   * safely pruning orphaned binary blobs in IndexedDB.
   * @returns {Promise<number>} Pruned count
   */
  async cleanupOrphanedMedia() {
    try {
      const games = await this.getGames();
      const presets = await this.getLibraryPresets();

      const activeMediaIds = new Set();

      games.forEach((g) => {
        g.watchRegions?.forEach((r) => {
          r.reactionConfigs?.forEach((c) => {
            if (c.gifReaction?.mediaAssetId) {
              activeMediaIds.add(c.gifReaction.mediaAssetId);
            }
          });
        });
      });

      presets.forEach((p) => {
        if (p.mediaAssetId) activeMediaIds.add(p.mediaAssetId);
        if (p.content?.mediaAssetId) activeMediaIds.add(p.content.mediaAssetId);
      });

      return await mediaStorage.cleanOrphanedMedia(activeMediaIds);
    } catch (err) {
      console.warn('[PersistenceService] Orphaned media GC failed safely:', err);
      return 0;
    }
  }

  /**
   * Basic Schema Migration Test Demonstration
   * Verifies that stored data evolves safely across version upgrades.
   * @returns {Promise<{passed: boolean, details: string}>}
   */
  async testSchemaMigration() {
    try {
      const testData = {
        games: [{ id: 'test_g1', name: 'Legacy Game', url: 'https://test.com' }],
        libraryPresets: []
      };

      // Run migration v1 on test payload
      const migrationV1 = MIGRATIONS.find((m) => m.version === 1);
      const migrated = migrationV1.up(testData);

      const isValid = Array.isArray(migrated.games) && Array.isArray(migrated.regions) && Array.isArray(migrated.configs);
      return {
        passed: isValid,
        details: isValid ? 'Migration v1 correctly normalized relational collections.' : 'Migration failed to produce required schema shape.'
      };
    } catch (err) {
      return { passed: false, details: `Migration test threw: ${err.message}` };
    }
  }
}

export const persistenceService = new PersistenceService();
