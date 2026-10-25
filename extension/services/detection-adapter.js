/**
 * Reactron Fingerprint Detection Adapter (Integrated with VisualFingerprintService)
 */

import { computeFingerprintSimilarity } from './visual-fingerprint-service.js';

export class IDetectionAdapter {
  constructor(name = 'base-adapter') {
    this.name = name;
  }
  compare(currentData, baselineData, options = {}) {
    throw new Error('Detection adapter must implement compare()');
  }
}

export class FingerprintDetectionAdapter extends IDetectionAdapter {
  constructor() {
    super('visual-fingerprint');
  }

  _pixelBufferToFingerprint(currentData) {
    if (!currentData) return [];
    const pixelData = currentData.data || currentData;
    if (!pixelData || pixelData.length === 0) return [];
    const totalPixels = pixelData.length / 4;
    const side = Math.round(Math.sqrt(totalPixels)) || 10;
    const width = currentData.width || side;
    const height = currentData.height || side;

    const gridSize = 12;
    const fingerprint = [];
    const cellW = width / gridSize;
    const cellH = height / gridSize;

    for (let gy = 0; gy < gridSize; gy++) {
      for (let gx = 0; gx < gridSize; gx++) {
        let rSum = 0, gSum = 0, bSum = 0, count = 0;

        const startX = Math.floor(gx * cellW);
        const endX = Math.floor((gx + 1) * cellW);
        const startY = Math.floor(gy * cellH);
        const endY = Math.floor((gy + 1) * cellH);

        for (let y = Math.max(0, startY); y < Math.min(height, endY); y++) {
          for (let x = Math.max(0, startX); x < Math.min(width, endX); x++) {
            const idx = (y * width + x) * 4;
            if (idx + 2 < pixelData.length) {
              rSum += pixelData[idx];
              gSum += pixelData[idx + 1];
              bSum += pixelData[idx + 2];
              count++;
            }
          }
        }

        if (count > 0) {
          fingerprint.push(rSum / count, gSum / count, bSum / count);
        } else {
          fingerprint.push(0, 0, 0);
        }
      }
    }
    return fingerprint;
  }

  compare(currentData, baselineData, options = {}) {
    const threshold = options.threshold ?? 75.0;
    if (!currentData || !baselineData) {
      return {
        hasTriggered: false,
        delta: 0.0,
        threshold,
        details: {
          similarityPct: 0.0,
          gridSize: '12x12'
        }
      };
    }

    const currFp = this._pixelBufferToFingerprint(currentData);
    const baseFp = this._pixelBufferToFingerprint(baselineData);

    const similarity = computeFingerprintSimilarity(currFp, baseFp);
    const hasTriggered = similarity >= threshold;

    return {
      hasTriggered,
      delta: similarity,
      threshold,
      details: {
        similarityPct: similarity,
        gridSize: '12x12'
      }
    };
  }
}

export const VisualDiffDetectionAdapter = FingerprintDetectionAdapter;
