/**
 * Reactron Mock Data Service (Stage 1 Foundation)
 * Provides clearly identified mock data for UI state modeling.
 * No persistent storage or fake production behavior.
 */

export const INITIAL_MOCK_GAMES = [];

export const MOCK_LIBRARY_GIFS = [
  { id: 'lib-g-1', type: 'gif', name: 'Fire Blast', summary: 'Explosive burst animation' },
  { id: 'lib-g-2', type: 'gif', name: 'Pixel Dance', summary: 'Victory character celebration' },
  { id: 'lib-g-3', type: 'gif', name: 'Game Over Skull', summary: 'Ominous retro defeat skull' }
];

export const MOCK_LIBRARY_TEXTS = [
  { id: 'lib-t-1', type: 'text', name: 'Critical Hit', summary: '"⚡ CRITICAL STRIKE!" • Impact' },
  { id: 'lib-t-2', type: 'text', name: 'Level Up', summary: '"⭐ LEVEL UP!" • Slide Top' },
  { id: 'lib-t-3', type: 'text', name: 'Defeat', summary: '"💀 WASTED" • Fade Zoom' }
];

/**
 * In-memory Mock State Store for Stage 1 demonstration
 */
class MockDataService {
  constructor() {
    this.games = JSON.parse(JSON.stringify(INITIAL_MOCK_GAMES));
    this.libraryGifs = JSON.parse(JSON.stringify(MOCK_LIBRARY_GIFS));
    this.libraryTexts = JSON.parse(JSON.stringify(MOCK_LIBRARY_TEXTS));
    this.activeGameId = null;
  }

  getGames() {
    return this.games;
  }

  getGame(id) {
    return this.games.find((g) => g.id === id) || null;
  }

  toggleGame(id) {
    const game = this.getGame(id);
    if (game) {
      game.isEnabled = !game.isEnabled;
    }
    return game;
  }

  createDraftGame() {
    const newId = `game-${Date.now()}`;
    const newGame = {
      id: newId,
      name: '',
      url: 'https://poki.com/en/g/active-tab-game',
      isEnabled: true,
      watchRegions: []
    };
    return newGame;
  }
}

export const mockDataService = new MockDataService();
