/**
 * Reactron Binary Media Storage Service (IndexedDB)
 * 
 * Primary responsibilities:
 * 1. Persists binary media blobs (GIFs, PNGs, JPEGs) in IndexedDB rather than
 *    congesting chrome.storage quotas with base64 strings.
 * 2. Deduplicates media uploads via SHA-256 / content fingerprinting.
 * 3. Provides stable mediaAssetId references for reaction configurations.
 * 4. Graceful fallback to memory storage in restricted environments.
 * 5. Safe orphaned media garbage collection.
 */

const DB_NAME = 'reactron_media_db';
const DB_VERSION = 1;
const STORE_NAME = 'media_blobs';

export class MediaStorageService {
  constructor() {
    this._db = null;
    this._initPromise = null;
    this._fallbackStore = new Map();
  }

  /**
   * Initializes or returns the open IndexedDB connection
   * @returns {Promise<IDBDatabase|null>}
   */
  async getDb() {
    if (this._db) return this._db;
    if (this._initPromise) return this._initPromise;

    if (typeof indexedDB === 'undefined') {
      console.warn('[MediaStorage] IndexedDB unavailable, using memory fallback.');
      return null;
    }

    this._initPromise = new Promise((resolve) => {
      try {
        const req = indexedDB.open(DB_NAME, DB_VERSION);

        req.onupgradeneeded = (e) => {
          const db = e.target.result;
          if (!db.objectStoreNames.contains(STORE_NAME)) {
            const store = db.createObjectStore(STORE_NAME, { keyPath: 'mediaAssetId' });
            store.createIndex('contentHash', 'contentHash', { unique: false });
          }
        };

        req.onsuccess = (e) => {
          this._db = e.target.result;
          resolve(this._db);
        };

        req.onerror = (e) => {
          console.warn('[MediaStorage] IndexedDB open error, using memory fallback:', e.target.error);
          resolve(null);
        };
      } catch (err) {
        console.warn('[MediaStorage] IndexedDB exception:', err);
        resolve(null);
      }
    });

    return this._initPromise;
  }

  /**
   * Computes a content hash of the full data URL string for deduplication
   * @private
   */
  _computeContentHash(dataUrl) {
    let hash1 = 5381;
    let hash2 = 52711;
    const len = dataUrl.length;
    for (let i = 0; i < len; i++) {
      const code = dataUrl.charCodeAt(i);
      hash1 = ((hash1 << 5) + hash1) ^ code;
      hash2 = ((hash2 << 5) + hash2) ^ code;
    }
    return `${len}_${(hash1 >>> 0).toString(16)}_${(hash2 >>> 0).toString(16)}`;
  }

  /**
   * Stores a media asset and returns a stable mediaAssetId
   * Deduplicates if identical media is uploaded again.
   * @param {string} dataUrl - Base64 Data URL or blob URL
   * @param {{fileName?: string, mimeType?: string, sizeBytes?: number}} metadata
   * @returns {Promise<string>} Stable mediaAssetId
   */
  async storeMedia(dataUrl, metadata = {}) {
    if (!dataUrl) throw new Error('Cannot store empty media.');

    const contentHash = this._computeContentHash(dataUrl);
    const db = await this.getDb();

    // Check for existing deduplicated entry
    if (db) {
      const existingId = await new Promise((resolve) => {
        try {
          const tx = db.transaction(STORE_NAME, 'readonly');
          const store = tx.objectStore(STORE_NAME);
          const index = store.index('contentHash');
          const req = index.get(contentHash);
          req.onsuccess = () => resolve(req.result ? req.result.mediaAssetId : null);
          req.onerror = () => resolve(null);
        } catch {
          resolve(null);
        }
      });

      if (existingId) {
        return existingId; // Reused existing asset without duplicating storage
      }
    } else {
      for (const existing of this._fallbackStore.values()) {
        if (existing.contentHash === contentHash) {
          return existing.mediaAssetId;
        }
      }
    }

    // Generate stable media ID
    const mediaAssetId = (typeof crypto !== 'undefined' && crypto.randomUUID)
      ? `media_${crypto.randomUUID()}`
      : `media_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

    const record = {
      mediaAssetId,
      dataUrl,
      fileName: metadata.fileName || 'media_asset',
      mimeType: metadata.mimeType || 'image/png',
      sizeBytes: metadata.sizeBytes || dataUrl.length,
      contentHash,
      createdAt: Date.now()
    };

    if (db) {
      await new Promise((resolve, reject) => {
        try {
          const tx = db.transaction(STORE_NAME, 'readwrite');
          const store = tx.objectStore(STORE_NAME);
          const req = store.put(record);
          req.onsuccess = () => resolve(true);
          req.onerror = () => reject(req.error || new Error('Failed to write media to IndexedDB'));
        } catch (err) {
          reject(err);
        }
      });
    } else {
      this._fallbackStore.set(mediaAssetId, record);
    }

    return mediaAssetId;
  }

  /**
   * Retrieves a media asset by ID
   * @param {string} mediaAssetId
   * @returns {Promise<{dataUrl: string, fileName: string, mimeType: string}|null>}
   */
  async getMedia(mediaAssetId) {
    if (!mediaAssetId) return null;

    const db = await this.getDb();
    if (db) {
      return new Promise((resolve) => {
        try {
          const tx = db.transaction(STORE_NAME, 'readonly');
          const store = tx.objectStore(STORE_NAME);
          const req = store.get(mediaAssetId);
          req.onsuccess = () => {
            if (req.result) {
              resolve({
                dataUrl: req.result.dataUrl,
                fileName: req.result.fileName,
                mimeType: req.result.mimeType
              });
            } else {
              resolve(this._fallbackStore.get(mediaAssetId) || null);
            }
          };
          req.onerror = () => resolve(this._fallbackStore.get(mediaAssetId) || null);
        } catch {
          resolve(this._fallbackStore.get(mediaAssetId) || null);
        }
      });
    }

    return this._fallbackStore.get(mediaAssetId) || null;
  }

  /**
   * Deletes a specific media asset by ID
   * @param {string} mediaAssetId
   * @returns {Promise<boolean>}
   */
  async deleteMedia(mediaAssetId) {
    if (!mediaAssetId) return false;

    this._fallbackStore.delete(mediaAssetId);
    const db = await this.getDb();
    if (!db) return true;

    return new Promise((resolve) => {
      try {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const req = store.delete(mediaAssetId);
        req.onsuccess = () => resolve(true);
        req.onerror = () => resolve(false);
      } catch {
        resolve(false);
      }
    });
  }

  /**
   * Prunes orphaned media assets no longer referenced by any reaction or preset
   * @param {Set<string>} referencedIdsSet
   * @returns {Promise<number>} Number of pruned assets
   */
  async cleanOrphanedMedia(referencedIdsSet) {
    let prunedCount = 0;
    for (const assetId of Array.from(this._fallbackStore.keys())) {
      if (!referencedIdsSet.has(assetId)) {
        this._fallbackStore.delete(assetId);
        prunedCount++;
      }
    }

    const db = await this.getDb();
    if (!db) return prunedCount;
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const req = store.openCursor();

        req.onsuccess = (e) => {
          const cursor = e.target.result;
          if (cursor) {
            const assetId = cursor.key;
            if (!referencedIdsSet.has(assetId)) {
              cursor.delete();
              prunedCount++;
            }
            cursor.continue();
          } else {
            resolve(prunedCount);
          }
        };

        req.onerror = () => resolve(prunedCount);
      } catch {
        resolve(prunedCount);
      }
    });
  }
}

export const mediaStorage = new MediaStorageService();
