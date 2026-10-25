/**
 * Reactron Centralized Game Identity Service
 * 
 * Primary responsibilities:
 * 1. Normalize URLs using a documented, deterministic matching policy.
 * 2. Compare URLs to detect duplicate game entries.
 * 3. Generate stable, persistent internal Game IDs (never using raw URLs as keys).
 * 
 * Documented URL Matching Policy:
 * -------------------------------------------------------------
 * 1. Protocol: Preserves http/https, normalizes case.
 * 2. Hostname: Case-insensitive, removes leading 'www.'.
 * 3. Path: Normalizes multiple slashes, removes trailing slash.
 * 4. Tracking Params: Strips analytics/attribution parameters
 *    (utm_*, fbclid, gclid, ref, source, campaign, _ga).
 * 5. Gameplay Params: Preserves game identifiers and room/game parameters
 *    (e.g., ?game=..., ?id=..., ?v=..., ?room=..., ?g=..., ?play=...).
 * 6. Query Ordering: Canonicalizes query keys alphabetically.
 * 7. Fragments: Strips non-routing anchors (#section), preserves SPA hash routes (e.g. #/play/...).
 */

const TRACKING_PARAMS = new Set([
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
  'fbclid',
  'gclid',
  'ref',
  'source',
  'campaign',
  'affiliate',
  '_ga',
  '_gl'
]);

export class GameIdentityService {
  /**
   * Generates a stable internal Game ID
   * @returns {string} Unique stable ID
   */
  static generateGameId() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      return `game_${crypto.randomUUID()}`;
    }
    return `game_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }

  /**
   * Generates a stable internal Region ID
   * @returns {string} Unique stable ID
   */
  static generateRegionId() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      return `region_${crypto.randomUUID()}`;
    }
    return `region_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }

  /**
   * Generates a stable internal Reaction Configuration ID
   * @returns {string} Unique stable ID
   */
  static generateReactionId() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      return `reaction_${crypto.randomUUID()}`;
    }
    return `reaction_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }

  /**
   * Normalizes a URL according to the established Game Identity Policy
   * @param {string} rawUrl - Full browser tab URL
   * @returns {string} Canonical identity string
   */
  static normalizeUrl(rawUrl) {
    if (!rawUrl || typeof rawUrl !== 'string') return '';

    let trimmed = rawUrl.trim();
    if (!/^https?:\/\//i.test(trimmed)) {
      trimmed = `https://${trimmed}`;
    }

    try {
      const url = new URL(trimmed);

      // 1. Hostname normalization
      let hostname = url.hostname.toLowerCase();
      if (hostname.startsWith('www.')) {
        hostname = hostname.substring(4);
      }

      // 2. Path normalization: remove trailing slash unless root '/'
      let pathname = url.pathname.replace(/\/+/g, '/');
      if (pathname.length > 1 && pathname.endsWith('/')) {
        pathname = pathname.slice(0, -1);
      }

      // 3. Query normalization: filter tracking params and sort remaining
      const searchParams = new URLSearchParams(url.search);
      const cleanedEntries = [];

      for (const [key, val] of searchParams.entries()) {
        const lowerKey = key.toLowerCase();
        if (!TRACKING_PARAMS.has(lowerKey)) {
          cleanedEntries.push([lowerKey, val]);
        }
      }

      cleanedEntries.sort(([a], [b]) => a.localeCompare(b));

      let canonicalSearch = '';
      if (cleanedEntries.length > 0) {
        const sortedParams = new URLSearchParams();
        cleanedEntries.forEach(([k, v]) => sortedParams.append(k, v));
        canonicalSearch = `?${sortedParams.toString()}`;
      }

      // 4. Fragment handling (SPA routes preserved, standard anchors dropped)
      let canonicalHash = '';
      if (url.hash && (url.hash.startsWith('#/') || url.hash.startsWith('#!/'))) {
        canonicalHash = url.hash.toLowerCase().replace(/\/+$/, '');
      }

      return `${url.protocol}//${hostname}${pathname}${canonicalSearch}${canonicalHash}`;
    } catch {
      // In case of non-standard or malformed string, perform safe fallback
      return rawUrl.trim().toLowerCase().replace(/\/+$/, '');
    }
  }

  /**
   * Compares two URLs to test whether they represent the same game identity
   * @param {string} url1
   * @param {string} url2
   * @returns {boolean}
   */
  static areEquivalent(url1, url2) {
    return this.normalizeUrl(url1) === this.normalizeUrl(url2);
  }

  /**
   * Checks whether a live tab URL matches a target game URL
   * @param {string} targetUrl
   * @param {string} candidateUrl
   * @returns {boolean}
   */
  static matchesUrl(targetUrl, candidateUrl) {
    if (!targetUrl || !candidateUrl) return false;
    return this.normalizeUrl(targetUrl) === this.normalizeUrl(candidateUrl);
  }

  /**
   * Checks if a URL represents a supported game tab
   * (rejects chrome://, edge://, about:blank, devtools://)
   * @param {string} url
   * @returns {{isEligible: boolean, reason?: string}}
   */
  static validateTabEligibility(url) {
    if (!url || typeof url !== 'string') {
      return { isEligible: false, reason: 'No active tab URL detected.' };
    }

    const trimmed = url.trim().toLowerCase();

    if (
      trimmed.startsWith('chrome://') ||
      trimmed.startsWith('chrome-extension://') ||
      trimmed.startsWith('edge://') ||
      trimmed.startsWith('about:') ||
      trimmed.startsWith('devtools://')
    ) {
      return {
        isEligible: false,
        reason: 'Reactron cannot monitor internal browser pages. Switch to a browser game tab.'
      };
    }

    return { isEligible: true };
  }
}
