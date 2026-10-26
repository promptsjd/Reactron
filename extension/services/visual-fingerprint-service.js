/**
 * @file src/extension-engine/visualFingerprintService.js
 * @module VisualFingerprintService
 * @description Single-Responsibility Module: Resolution-Independent Visual Region Cropping & Calibrated RGB + Structural Similarity Math.
 *
 * ARCHITECTURAL CONTRACT:
 * - Pure image/canvas processing utilities with zero knowledge of DetectorEngine state or ConfigManager.
 * - Samples any relative percentage rectangle (xPct, yPct, widthPct, heightPct) and normalizes it
 *   into a 12x12 RGB grid (432 values) + 160px preview thumbnail.
 * - Computes similarity by combining per-channel RGB Manhattan distance, spatial luminance gradient structure,
 *   and contrast range consistency so flat/uniform or structurally distinct non-trigger states do not false-positive.
 */

import { ENGINE_CONSTANTS } from './constants.js';

function computeCellLuminance(fp, cellIndex) {
  const base = cellIndex * 3;
  const r = fp[base] || 0;
  const g = fp[base + 1] || 0;
  const b = fp[base + 2] || 0;
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

/**
 * Computes visual similarity percentage (0..100) between two RGB fingerprints.
 */
export function computeFingerprintSimilarity(
  fpA,
  fpB
) {
  if (!Array.isArray(fpA) || !Array.isArray(fpB) || !fpA.length || fpA.length !== fpB.length) {
    return 0;
  }

  let totalRgbDiff = 0;
  const maxPossibleRgbDiff = fpA.length * 255;

  for (let i = 0; i < fpA.length; i++) {
    totalRgbDiff += Math.abs(fpA[i] - fpB[i]);
  }

  const normalizedRgbDiff = totalRgbDiff / maxPossibleRgbDiff;
  const gridSize = ENGINE_CONSTANTS.VISUAL_BOX.FINGERPRINT_GRID_SIZE;
  const expectedLength = gridSize * gridSize * 3;

  if (fpA.length !== expectedLength) {
    const rawSim = Math.max(
      0,
      1 - normalizedRgbDiff * ENGINE_CONSTANTS.VISUAL_BOX.SIMILARITY_CONTRAST_FACTOR
    );
    return Math.round(rawSim * 100);
  }

  const cellCount = gridSize * gridSize;
  const lumA = new Float64Array(cellCount);
  const lumB = new Float64Array(cellCount);

  let minLumA = 255;
  let maxLumA = 0;
  let minLumB = 255;
  let maxLumB = 0;

  for (let c = 0; c < cellCount; c++) {
    const la = computeCellLuminance(fpA, c);
    const lb = computeCellLuminance(fpB, c);
    lumA[c] = la;
    lumB[c] = lb;
    if (la < minLumA) minLumA = la;
    if (la > maxLumA) maxLumA = la;
    if (lb < minLumB) minLumB = lb;
    if (lb > maxLumB) maxLumB = lb;
  }

  let totalGradDiff = 0;
  let gradPairs = 0;

  for (let row = 0; row < gridSize; row++) {
    for (let col = 0; col < gridSize; col++) {
      const idx = row * gridSize + col;
      if (col + 1 < gridSize) {
        const gxA = lumA[idx + 1] - lumA[idx];
        const gxB = lumB[idx + 1] - lumB[idx];
        totalGradDiff += Math.abs(gxA - gxB);
        gradPairs++;
      }
      if (row + 1 < gridSize) {
        const gyA = lumA[idx + gridSize] - lumA[idx];
        const gyB = lumB[idx + gridSize] - lumB[idx];
        totalGradDiff += Math.abs(gyA - gyB);
        gradPairs++;
      }
    }
  }

  const normalizedGradDiff = gradPairs > 0 ? totalGradDiff / (gradPairs * 255) : 0;

  const spanA = maxLumA - minLumA;
  const spanB = maxLumB - minLumB;
  const contrastSpanDiff = Math.abs(spanA - spanB) / 255;

  const combinedDissimilarity =
    normalizedRgbDiff * 0.65 + normalizedGradDiff * 0.2 + contrastSpanDiff * 0.15;

  const normalizedSimilarity = Math.max(
    0,
    1 - combinedDissimilarity * ENGINE_CONSTANTS.VISUAL_BOX.SIMILARITY_CONTRAST_FACTOR
  );
  return Math.round(normalizedSimilarity * 100);
}
