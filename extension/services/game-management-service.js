/**
 * Reactron Game Management Service
 * 
 * Single service responsible for:
 * 1. Managing Game collection lifecycle.
 * 2. Querying active Chrome tab information.
 * 3. Enforcing Game Name validation (non-empty, <= 15 chars, unique) at service boundary.
 * 4. Duplicate identity detection using GameIdentityService.
 * 5. Toggling enabled/disabled state without deletion.
 */

import { GameIdentityService } from './game-identity-service.js';
import { persistenceService } from './persistence-service.js';
import { VALIDATION_LIMITS, validateGameName } from '../shared/validation.js';

export class GameManagementService {
  constructor() {
    this._games = [];
    this._isInitialized = false;
  }

  /**
   * Initializes games from persistence service (and schema migrations)
   */
  async initialize() {
    if (this._isInitialized) return this._games;

    await persistenceService.initialize();
    this._games = await persistenceService.getGames();
    this._isInitialized = true;
    return this._games;
  }

  /**
   * Retrieves all saved games
   * @returns {Array<import('../shared/types.js').GameEntry>}
   */
  getGames() {
    return this._games;
  }

  /**
   * Retrieves a specific game by stable ID
   * @param {string} id
   * @returns {import('../shared/types.js').GameEntry|null}
   */
  getGameById(id) {
    return this._games.find((g) => g.id === id) || null;
  }

  /**
   * Finds an existing game matching a URL identity
   * @param {string} url
   * @returns {import('../shared/types.js').GameEntry|null}
   */
  findGameByUrl(url) {
    const canonical = GameIdentityService.normalizeUrl(url);
    return this._games.find((g) => g.canonicalIdentity === canonical) || null;
  }

  /**
   * Queries the currently active Chrome tab
   * @returns {Promise<{url: string, title: string, id?: number, eligibility: {isEligible: boolean, reason?: string}}>}
   */
  async getActiveTab() {
    if (typeof chrome !== 'undefined' && chrome.tabs && chrome.tabs.query) {
      return new Promise((resolve) => {
        const querySpecs = [
          { active: true, lastFocusedWindow: true },
          { active: true, currentWindow: true },
          { active: true }
        ];

        const tryQuery = (index) => {
          if (index >= querySpecs.length) {
            resolve({
              url: 'https://poki.com/en/g/astro-blaster',
              title: 'Active Game Tab',
              eligibility: { isEligible: true }
            });
            return;
          }

          chrome.tabs.query(querySpecs[index], (tabs) => {
            if (!chrome.runtime.lastError && tabs && tabs.length > 0) {
              const tabWithUrl = tabs.find((t) => t.url || t.pendingUrl) || tabs[0];
              const rawUrl = tabWithUrl.url || tabWithUrl.pendingUrl || '';

              if (rawUrl) {
                const eligibility = GameIdentityService.validateTabEligibility(rawUrl);
                resolve({
                  url: rawUrl,
                  title: tabWithUrl.title || 'Game Tab',
                  id: tabWithUrl.id,
                  eligibility
                });
                return;
              }
            }
            tryQuery(index + 1);
          });
        };

        tryQuery(0);
      });
    }

    // Fallback for non-extension preview environment
    return {
      url: 'https://poki.com/en/g/astro-blaster',
      title: 'Active Game Tab',
      eligibility: { isEligible: true }
    };
  }

  /**
   * Creates a draft game object from active tab details
   * @param {string} url
   * @param {string} [title='']
   * @returns {import('../shared/types.js').GameEntry}
   */
  createDraftGame(url, title = '') {
    const stableId = GameIdentityService.generateGameId();
    const canonicalIdentity = GameIdentityService.normalizeUrl(url);

    // Default name derived from title or domain, truncated to 15 chars
    let defaultName = '';
    if (title && title.trim()) {
      defaultName = title.split(/[-–|:]/)[0].trim().slice(0, VALIDATION_LIMITS.GAME_NAME_MAX_LENGTH);
    }
    if (!defaultName) {
      try {
        const domain = new URL(url).hostname.replace('www.', '').split('.')[0];
        defaultName = (domain.charAt(0).toUpperCase() + domain.slice(1)).slice(0, VALIDATION_LIMITS.GAME_NAME_MAX_LENGTH);
      } catch {
        defaultName = 'New Game';
      }
    }

    // Ensure initial uniqueness if collision occurs
    let candidateName = defaultName;
    let counter = 1;
    while (this._games.some((g) => g.name.toLowerCase() === candidateName.toLowerCase())) {
      candidateName = `${defaultName.slice(0, 12)} ${counter++}`;
    }

    return {
      id: stableId,
      name: candidateName,
      url: url,
      canonicalIdentity,
      isEnabled: true,
      watchRegions: [],
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
  }

  /**
   * Saves or updates a GameEntry with strict boundary validation
   * @param {import('../shared/types.js').GameEntry} gameData
   * @returns {Promise<{success: boolean, game?: import('../shared/types.js').GameEntry, error?: string}>}
   */
  async saveGame(gameData) {
    // Service-boundary validation
    const valResult = validateGameName(gameData.name, this._games, gameData.id);
    if (!valResult.isValid) {
      return { success: false, error: valResult.error };
    }

    const trimmedName = gameData.name.trim();
    const canonicalIdentity = GameIdentityService.normalizeUrl(gameData.url);

    const updatedGame = {
      ...gameData,
      name: trimmedName,
      canonicalIdentity,
      updatedAt: Date.now()
    };

    const result = await persistenceService.saveGame(updatedGame);
    if (result.success) {
      this._games = await persistenceService.getGames();
      return { success: true, game: result.game };
    }

    return { success: false, error: result.error || 'Failed to save game' };
  }

  /**
   * Toggles enabled state of a game without deleting it
   * @param {string} id
   * @param {boolean} [explicitState]
   * @returns {Promise<boolean>}
   */
  async toggleGameEnabled(id, explicitState) {
    const game = this.getGameById(id);
    if (!game) return false;

    game.isEnabled = explicitState !== undefined ? explicitState : !game.isEnabled;
    game.updatedAt = Date.now();
    await persistenceService.saveGame(game);
    this._games = await persistenceService.getGames();
    return game.isEnabled;
  }

  /**
   * Deletes a game by ID
   * @param {string} id
   * @returns {Promise<boolean>}
   */
  async deleteGame(id) {
    await persistenceService.deleteGame(id);
    this._games = await persistenceService.getGames();
    return true;
  }
}

export const gameManagementService = new GameManagementService();
