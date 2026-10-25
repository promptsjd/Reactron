import { persistenceService } from './persistence-service.js';

export class StorageAdapter {
  async getGames() {
    return persistenceService.getGames();
  }

  async saveGames(games) {
    try {
      await persistenceService._writeKey('reactron_games_store', games);
      return true;
    } catch {
      return false;
    }
  }
}

export const storageAdapter = new StorageAdapter();
