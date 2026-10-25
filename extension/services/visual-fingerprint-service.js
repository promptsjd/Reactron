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

export function extractPixelRegionFingerprint(
  imageSource,
  sx,
  sy,
  sw,
  sh
) {
  const {
    FINGERPRINT_GRID_SIZE,
    PREVIEW_THUMB_WIDTH_PX,
    PREVIEW_THUMB_MIN_HEIGHT_PX,
    PREVIEW_THUMB_MAX_HEIGHT_PX,
    MIN_CAPTURE_DIMENSION_PX
  } = ENGINE_CONSTANTS.VISUAL_BOX;

  const safeW = Math.max(MIN_CAPTURE_DIMENSION_PX, Math.round(sw));
  const safeH = Math.max(MIN_CAPTURE_DIMENSION_PX, Math.round(sh));
  const safeX = Math.max(0, Math.round(sx));
  const safeY = Math.max(0, Math.round(sy));

  // 1. Render human-readable preview thumbnail
  const previewCanvas = document.createElement('canvas');
  const aspect = safeW / Math.max(1, safeH);
  previewCanvas.width = PREVIEW_THUMB_WIDTH_PX;
  previewCanvas.height = Math.max(
    PREVIEW_THUMB_MIN_HEIGHT_PX,
    Math.min(PREVIEW_THUMB_MAX_HEIGHT_PX, Math.round(PREVIEW_THUMB_WIDTH_PX / aspect))
  );
  const previewCtx = previewCanvas.getContext('2d');
  if (previewCtx) {
    previewCtx.drawImage(
      imageSource,
      safeX,
      safeY,
      safeW,
      safeH,
      0,
      0,
      previewCanvas.width,
      previewCanvas.height
    );
  }
  let snapshotDataUrl = '';
  try {
    snapshotDataUrl = previewCanvas.toDataURL('image/png');
  } catch {
    snapshotDataUrl = '';
  }

  // 2. Render resolution-independent RGB grid fingerprint
  const fpCanvas = document.createElement('canvas');
  fpCanvas.width = FINGERPRINT_GRID_SIZE;
  fpCanvas.height = FINGERPRINT_GRID_SIZE;
  const fpCtx = fpCanvas.getContext('2d');
  const fingerprint = [];

  if (fpCtx) {
    fpCtx.drawImage(
      imageSource,
      safeX,
      safeY,
      safeW,
      safeH,
      0,
      0,
      FINGERPRINT_GRID_SIZE,
      FINGERPRINT_GRID_SIZE
    );
    const imgData = fpCtx.getImageData(0, 0, FINGERPRINT_GRID_SIZE, FINGERPRINT_GRID_SIZE).data;
    for (let i = 0; i < imgData.length; i += 4) {
      fingerprint.push(imgData[i], imgData[i + 1], imgData[i + 2]);
    }
  }

  return { snapshotDataUrl, fingerprint };
}

export function captureCanvasRegionSnapshot(
  canvas,
  boxPct
) {
  const { BASE_CANVAS_WIDTH, BASE_CANVAS_HEIGHT } = ENGINE_CONSTANTS.PREVIEW_STAGE;
  const { MIN_CAPTURE_DIMENSION_PX } = ENGINE_CONSTANTS.VISUAL_BOX;

  const cw = canvas.width || canvas.clientWidth || BASE_CANVAS_WIDTH;
  const ch = canvas.height || canvas.clientHeight || BASE_CANVAS_HEIGHT;

  const sx = Math.max(0, Math.min(cw - 4, Math.round((boxPct.xPct / 100) * cw)));
  const sy = Math.max(0, Math.min(ch - 4, Math.round((boxPct.yPct / 100) * ch)));
  const sw = Math.max(
    MIN_CAPTURE_DIMENSION_PX,
    Math.min(cw - sx, Math.round((boxPct.widthPct / 100) * cw))
  );
  const sh = Math.max(
    MIN_CAPTURE_DIMENSION_PX,
    Math.min(ch - sy, Math.round((boxPct.heightPct / 100) * ch))
  );

  return extractPixelRegionFingerprint(canvas, sx, sy, sw, sh);
}

/**
 * Crops a relative percentage box (xPct, yPct, widthPct, heightPct) anchored to gameRect
 * out of a full-tab screenshot Data URL (from chrome.tabs.captureVisibleTab).
 */
export function captureTabScreenshotRegion(
  screenshotDataUrl,
  gameRect,
  viewportW,
  viewportH,
  boxPct
) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      try {
        const scaleX = (img.naturalWidth || viewportW) / Math.max(1, viewportW);
        const scaleY = (img.naturalHeight || viewportH) / Math.max(1, viewportH);

        const regionLeftCss = gameRect.left + (boxPct.xPct / 100) * gameRect.width;
        const regionTopCss = gameRect.top + (boxPct.yPct / 100) * gameRect.height;
        const regionWidthCss = (boxPct.widthPct / 100) * gameRect.width;
        const regionHeightCss = (boxPct.heightPct / 100) * gameRect.height;

        const sx = regionLeftCss * scaleX;
        const sy = regionTopCss * scaleY;
        const sw = regionWidthCss * scaleX;
        const sh = regionHeightCss * scaleY;

        const result = extractPixelRegionFingerprint(img, sx, sy, sw, sh);
        resolve(result);
      } catch (err) {
        reject(err);
      }
    };
    img.onerror = reject;
    img.src = screenshotDataUrl;
  });
}

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

/**
 * Computes the hysteresis reset floor for a given matchSensitivity threshold.
 */
export function computeHysteresisResetFloor(matchSensitivityPct) {
  const {
    SENSITIVITY_DEFAULT_PCT,
    HYSTERESIS_RESET_DELTA_PCT,
    MIN_HYSTERESIS_FLOOR_PCT
  } = ENGINE_CONSTANTS.VISUAL_BOX;
  const threshold =
    typeof matchSensitivityPct === 'number' && Number.isFinite(matchSensitivityPct)
      ? matchSensitivityPct
      : SENSITIVITY_DEFAULT_PCT;
  return Math.max(MIN_HYSTERESIS_FLOOR_PCT, threshold - HYSTERESIS_RESET_DELTA_PCT);
}
