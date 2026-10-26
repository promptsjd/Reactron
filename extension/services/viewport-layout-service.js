/**
 * Reactron Viewport & Game Surface Layout Service
 *
 * Single-responsibility module for:
 * 1. Discovering the active game rendering surface (<canvas>, <iframe>, or stage container) in the DOM.
 * 2. Normalizing Watch Region coordinates and Reaction Overlay positions relative to both the
 *    browser viewport and the active game surface.
 * 3. Projecting normalized Watch Regions onto live screenshots across browser window resizes,
 *    supporting DOM-bounded canvases, aspect-ratio-contained (letterboxed/pillarboxed) stages,
 *    and direct viewport scaling.
 * 4. Computing proportional scale factors and live viewport positions for GIF/Image and Text
 *    reaction overlays when the browser window is resized.
 */

export const SCALE_BOUNDS = {
  MIN_SCALE: 0.4,
  MAX_SCALE: 2.5,
  MIN_SURFACE_AREA_RATIO: 0.15
};

export class ViewportLayoutService {
  /**
   * Resolves the bounding box of the primary visible game surface (<canvas>, <iframe>, or game container)
   * within the current document viewport. Falls back to the full viewport if no distinct surface is found.
   *
   * @param {Document} [doc]
   * @param {Window} [win]
   * @returns {{
   *   left: number,
   *   top: number,
   *   width: number,
   *   height: number,
   *   viewportWidth: number,
   *   viewportHeight: number,
   *   hasDedicatedSurface: boolean
   * }}
   */
  static resolveGameSurfaceBounds(doc = typeof document !== 'undefined' ? document : null, win = typeof window !== 'undefined' ? window : null) {
    const vw = Math.max(win?.innerWidth || doc?.documentElement?.clientWidth || 1, 1);
    const vh = Math.max(win?.innerHeight || doc?.documentElement?.clientHeight || 1, 1);

    const fallback = {
      left: 0,
      top: 0,
      width: vw,
      height: vh,
      viewportWidth: vw,
      viewportHeight: vh,
      hasDedicatedSurface: false
    };

    if (!doc || typeof doc.querySelectorAll !== 'function') {
      return fallback;
    }

    const viewportArea = vw * vh;
    const minSurfaceArea = viewportArea * SCALE_BOUNDS.MIN_SURFACE_AREA_RATIO;

    const candidates = doc.querySelectorAll(
      'canvas, iframe, video, #game-container, #game-frame, #unity-canvas, #unity-container, [id*="game-canvas"], [class*="game-canvas"]'
    );

    let bestRect = null;
    let bestScore = 0;

    for (const el of candidates) {
      if (!el || typeof el.getBoundingClientRect !== 'function') continue;

      if (win && typeof win.getComputedStyle === 'function') {
        const style = win.getComputedStyle(el);
        if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) {
          continue;
        }
      }

      const rect = el.getBoundingClientRect();
      const visibleLeft = Math.max(0, rect.left);
      const visibleTop = Math.max(0, rect.top);
      const visibleRight = Math.min(vw, rect.right);
      const visibleBottom = Math.min(vh, rect.bottom);

      const visibleW = Math.max(0, visibleRight - visibleLeft);
      const visibleH = Math.max(0, visibleBottom - visibleTop);
      const visibleArea = visibleW * visibleH;

      if (visibleArea < minSurfaceArea) continue;

      const tagName = (el.tagName || '').toLowerCase();
      const tagPriority = tagName === 'canvas' ? 1.15 : tagName === 'iframe' ? 1.1 : 1.0;
      const score = visibleArea * tagPriority;

      if (score > bestScore) {
        bestScore = score;
        bestRect = {
          left: Number(visibleLeft.toFixed(2)),
          top: Number(visibleTop.toFixed(2)),
          width: Number(visibleW.toFixed(2)),
          height: Number(visibleH.toFixed(2))
        };
      }
    }

    if (!bestRect || bestRect.width < 10 || bestRect.height < 10) {
      return fallback;
    }

    return {
      left: bestRect.left,
      top: bestRect.top,
      width: bestRect.width,
      height: bestRect.height,
      viewportWidth: vw,
      viewportHeight: vh,
      hasDedicatedSurface: true
    };
  }

  /**
   * Computes an aspect-ratio-contained rectangle (equivalent to CSS `object-fit: contain`)
   * inside a container of dimensions `(containerW, containerH)`.
   *
   * @param {number} containerW
   * @param {number} containerH
   * @param {number} refAspectRatio - width / height at capture time
   * @param {number} [offsetX=0]
   * @param {number} [offsetY=0]
   * @returns {{ left: number, top: number, width: number, height: number }}
   */
  static computeContainedRect(containerW, containerH, refAspectRatio, offsetX = 0, offsetY = 0) {
    const safeW = Math.max(containerW || 1, 1);
    const safeH = Math.max(containerH || 1, 1);
    if (!refAspectRatio || !Number.isFinite(refAspectRatio) || refAspectRatio <= 0) {
      return { left: offsetX, top: offsetY, width: safeW, height: safeH };
    }

    const currentAspect = safeW / safeH;
    if (Math.abs(currentAspect - refAspectRatio) < 0.01) {
      return { left: offsetX, top: offsetY, width: safeW, height: safeH };
    }

    let width = safeW;
    let height = safeH;
    let left = offsetX;
    let top = offsetY;

    if (currentAspect > refAspectRatio) {
      // Container is wider than reference -> pillarbox (horizontal bars)
      width = safeH * refAspectRatio;
      left = offsetX + (safeW - width) / 2;
    } else {
      // Container is taller/narrower than reference -> letterbox (vertical bars)
      height = safeW / refAspectRatio;
      top = offsetY + (safeH - height) / 2;
    }

    return { left, top, width, height };
  }

  /**
   * Normalizes a selected pixel rectangle (`{ x, y, width, height }` in CSS pixels)
   * relative to both the viewport and the resolved game surface.
   *
   * @param {{ x: number, y: number, width: number, height: number }} pixelRect
   * @param {Object} surfaceBounds - Result of `resolveGameSurfaceBounds()`
   * @returns {import('../shared/types.js').NormalizedGeometry}
   */
  static normalizeRegionToSurface(pixelRect, surfaceBounds) {
    const vw = Math.max(surfaceBounds?.viewportWidth || 1, 1);
    const vh = Math.max(surfaceBounds?.viewportHeight || 1, 1);

    const surfLeft = surfaceBounds?.left || 0;
    const surfTop = surfaceBounds?.top || 0;
    const surfW = Math.max(surfaceBounds?.width || vw, 1);
    const surfH = Math.max(surfaceBounds?.height || vh, 1);

    const relX = (pixelRect.x - surfLeft) / surfW;
    const relY = (pixelRect.y - surfTop) / surfH;
    const relW = pixelRect.width / surfW;
    const relH = pixelRect.height / surfH;

    return {
      x: Number((pixelRect.x / vw).toFixed(4)),
      y: Number((pixelRect.y / vh).toFixed(4)),
      width: Number((pixelRect.width / vw).toFixed(4)),
      height: Number((pixelRect.height / vh).toFixed(4)),
      viewportWidth: vw,
      viewportHeight: vh,
      surfaceX: Number(Math.max(0, Math.min(1, relX)).toFixed(4)),
      surfaceY: Number(Math.max(0, Math.min(1, relY)).toFixed(4)),
      surfaceWidth: Number(Math.max(0.001, Math.min(1, relW)).toFixed(4)),
      surfaceHeight: Number(Math.max(0.001, Math.min(1, relH)).toFixed(4)),
      surfaceRefWidth: Math.round(surfW),
      surfaceRefHeight: Math.round(surfH),
      hasDedicatedSurface: Boolean(surfaceBounds?.hasDedicatedSurface)
    };
  }

  /**
   * Clamps a pixel crop box safely inside screenshot dimensions `[0, screenshotWidth] x [0, screenshotHeight]`.
   *
   * @param {number} rawX
   * @param {number} rawY
   * @param {number} rawW
   * @param {number} rawH
   * @param {number} screenshotWidth
   * @param {number} screenshotHeight
   * @param {string} [mode='viewport']
   * @returns {{ cropX: number, cropY: number, cropW: number, cropH: number, mode: string }}
   */
  static _clampCropRect(rawX, rawY, rawW, rawH, screenshotWidth, screenshotHeight, mode = 'viewport') {
    const maxW = Math.max(1, Math.round(screenshotWidth || 1));
    const maxH = Math.max(1, Math.round(screenshotHeight || 1));

    const cropX = Math.max(0, Math.min(maxW - 1, Math.round(rawX)));
    const cropY = Math.max(0, Math.min(maxH - 1, Math.round(rawY)));
    const cropW = Math.max(1, Math.min(maxW - cropX, Math.round(rawW)));
    const cropH = Math.max(1, Math.min(maxH - cropY, Math.round(rawH)));

    return { cropX, cropY, cropW, cropH, mode };
  }

  /**
   * Projects a saved `NormalizedGeometry` onto a captured screenshot of dimensions
   * `(screenshotWidth, screenshotHeight)`, returning candidate crop rectangles to handle:
   * 1. Surface-anchored DOM resizing (`<canvas>` / `<iframe>` shifted or scaled in DOM)
   * 2. Aspect-ratio-contained resizing (pillarboxed / letterboxed internal canvas stage)
   * 3. Direct proportional viewport scaling (viewport-anchored HUD elements)
   *
   * Deduplicates identical crop rectangles so no redundant crops are performed when
   * the browser window has not been resized or when projections coincide.
   *
   * @param {import('../shared/types.js').NormalizedGeometry} geometry
   * @param {Object|null} liveBounds - Live surface bounds from content script (if available)
   * @param {number} screenshotWidth
   * @param {number} screenshotHeight
   * @returns {Array<{ cropX: number, cropY: number, cropW: number, cropH: number, mode: string }>}
   */
  static getCandidateProjections(geometry, liveBounds, screenshotWidth, screenshotHeight) {
    if (!geometry || !screenshotWidth || !screenshotHeight) {
      return [];
    }

    const candidates = [];
    const seenKeys = new Set();

    const addCandidate = (rect) => {
      const key = `${rect.cropX}:${rect.cropY}:${rect.cropW}:${rect.cropH}`;
      if (!seenKeys.has(key)) {
        seenKeys.add(key);
        candidates.push(rect);
      }
    };

    const sX = geometry.surfaceX !== undefined ? geometry.surfaceX : geometry.x;
    const sY = geometry.surfaceY !== undefined ? geometry.surfaceY : geometry.y;
    const sW = geometry.surfaceWidth !== undefined ? geometry.surfaceWidth : geometry.width;
    const sH = geometry.surfaceHeight !== undefined ? geometry.surfaceHeight : geometry.height;

    const refW = geometry.surfaceRefWidth || geometry.viewportWidth || screenshotWidth;
    const refH = geometry.surfaceRefHeight || geometry.viewportHeight || screenshotHeight;
    const refAspect = refW > 0 && refH > 0 ? refW / refH : screenshotWidth / screenshotHeight;

    // 1. Live DOM Game Surface projection (when content script reports a valid surface)
    if (liveBounds && liveBounds.viewportWidth > 0 && liveBounds.viewportHeight > 0) {
      const scaleX = screenshotWidth / liveBounds.viewportWidth;
      const scaleY = screenshotHeight / liveBounds.viewportHeight;

      const surfLeftPx = (liveBounds.left || 0) * scaleX;
      const surfTopPx = (liveBounds.top || 0) * scaleY;
      const surfWidthPx = (liveBounds.width || liveBounds.viewportWidth) * scaleX;
      const surfHeightPx = (liveBounds.height || liveBounds.viewportHeight) * scaleY;

      // 1a. Direct surface bounds mapping
      addCandidate(
        this._clampCropRect(
          surfLeftPx + sX * surfWidthPx,
          surfTopPx + sY * surfHeightPx,
          sW * surfWidthPx,
          sH * surfHeightPx,
          screenshotWidth,
          screenshotHeight,
          'surface'
        )
      );

      // 1b. Aspect-ratio-contained stage inside the live surface (for full-bleed canvases that pillarbox/letterbox internally)
      const containedInSurf = this.computeContainedRect(
        surfWidthPx,
        surfHeightPx,
        refAspect,
        surfLeftPx,
        surfTopPx
      );
      addCandidate(
        this._clampCropRect(
          containedInSurf.left + sX * containedInSurf.width,
          containedInSurf.top + sY * containedInSurf.height,
          sW * containedInSurf.width,
          sH * containedInSurf.height,
          screenshotWidth,
          screenshotHeight,
          'surface-aspect-contain'
        )
      );
    }

    // 2. Aspect-ratio-contained stage inside the full screenshot (when live DOM bounds are unavailable or full-window)
    const containedInViewport = this.computeContainedRect(
      screenshotWidth,
      screenshotHeight,
      refAspect,
      0,
      0
    );
    addCandidate(
      this._clampCropRect(
        containedInViewport.left + sX * containedInViewport.width,
        containedInViewport.top + sY * containedInViewport.height,
        sW * containedInViewport.width,
        sH * containedInViewport.height,
        screenshotWidth,
        screenshotHeight,
        'aspect-contain'
      )
    );

    // 3. Direct proportional viewport mapping (backward-compatible & HUD-anchored fallback)
    addCandidate(
      this._clampCropRect(
        geometry.x * screenshotWidth,
        geometry.y * screenshotHeight,
        geometry.width * screenshotWidth,
        geometry.height * screenshotHeight,
        screenshotWidth,
        screenshotHeight,
        'viewport'
      )
    );

    return candidates;
  }

  /**
   * Returns the primary projected crop rectangle in screenshot pixel space.
   *
   * @param {import('../shared/types.js').NormalizedGeometry} geometry
   * @param {Object|null} liveBounds
   * @param {number} screenshotWidth
   * @param {number} screenshotHeight
   * @returns {{ cropX: number, cropY: number, cropW: number, cropH: number, mode: string }|null}
   */
  static projectRegionToScreenshot(geometry, liveBounds, screenshotWidth, screenshotHeight) {
    const candidates = this.getCandidateProjections(geometry, liveBounds, screenshotWidth, screenshotHeight);
    return candidates.length > 0 ? candidates[0] : null;
  }

  /**
   * Resolves the effective active stage rectangle in CSS pixels for reaction positioning & scaling.
   * If the DOM surface fills the full viewport (`width === vw && height === vh`) and a reference
   * aspect ratio from capture time differs from the current viewport aspect ratio, returns the
   * aspect-contained stage rectangle. Otherwise returns the live DOM surface bounds.
   *
   * @param {Object} liveSurfaceBounds
   * @param {{ refWidth?: number, refHeight?: number }} [referenceDims]
   * @returns {{ left: number, top: number, width: number, height: number, viewportWidth: number, viewportHeight: number }}
   */
  static resolveEffectiveStageRect(liveSurfaceBounds, referenceDims = {}) {
    const vw = Math.max(liveSurfaceBounds?.viewportWidth || 1, 1);
    const vh = Math.max(liveSurfaceBounds?.viewportHeight || 1, 1);
    const surfLeft = liveSurfaceBounds?.left || 0;
    const surfTop = liveSurfaceBounds?.top || 0;
    const surfW = Math.max(liveSurfaceBounds?.width || vw, 1);
    const surfH = Math.max(liveSurfaceBounds?.height || vh, 1);

    const isFullBleed =
      Math.abs(surfW - vw) <= 4 &&
      Math.abs(surfH - vh) <= 4 &&
      surfLeft <= 2 &&
      surfTop <= 2;

    const refW = referenceDims?.refWidth || 0;
    const refH = referenceDims?.refHeight || 0;

    if (isFullBleed && refW > 0 && refH > 0) {
      const refAspect = refW / refH;
      const contained = this.computeContainedRect(vw, vh, refAspect, 0, 0);
      return {
        left: contained.left,
        top: contained.top,
        width: contained.width,
        height: contained.height,
        viewportWidth: vw,
        viewportHeight: vh
      };
    }

    return {
      left: surfLeft,
      top: surfTop,
      width: surfW,
      height: surfH,
      viewportWidth: vw,
      viewportHeight: vh
    };
  }

  /**
   * Normalizes a pointer coordinate `(clientX, clientY)` during Reposition Mode
   * relative to both the viewport and the active game surface.
   *
   * @param {number} clientX
   * @param {number} clientY
   * @param {Object} surfaceBounds - Result of `resolveGameSurfaceBounds()`
   * @returns {import('../shared/types.js').NormalizedPosition}
   */
  static normalizePositionToSurface(clientX, clientY, surfaceBounds) {
    const vw = Math.max(surfaceBounds?.viewportWidth || 1, 1);
    const vh = Math.max(surfaceBounds?.viewportHeight || 1, 1);

    const clampedX = Math.max(vw * 0.05, Math.min(clientX, vw * 0.95));
    const clampedY = Math.max(vh * 0.05, Math.min(clientY, vh * 0.95));

    const xRatio = Number((clampedX / vw).toFixed(4));
    const yRatio = Number((clampedY / vh).toFixed(4));

    const surfLeft = surfaceBounds?.left || 0;
    const surfTop = surfaceBounds?.top || 0;
    const surfW = Math.max(surfaceBounds?.width || vw, 1);
    const surfH = Math.max(surfaceBounds?.height || vh, 1);

    const sX = Math.max(0.02, Math.min(0.98, (clampedX - surfLeft) / surfW));
    const sY = Math.max(0.02, Math.min(0.98, (clampedY - surfTop) / surfH));

    return {
      xRatio,
      yRatio,
      surfaceXRatio: Number(sX.toFixed(4)),
      surfaceYRatio: Number(sY.toFixed(4)),
      referenceWidth: Math.round(surfW),
      referenceHeight: Math.round(surfH),
      viewportWidth: vw,
      viewportHeight: vh
    };
  }

  /**
   * Projects a saved `NormalizedPosition` onto the current live viewport/stage,
   * returning updated viewport ratios (`xRatio`, `yRatio`) so the reaction overlay
   * stays anchored to its intended location on the game screen after browser resizes.
   *
   * @param {import('../shared/types.js').NormalizedPosition|undefined} position
   * @param {Object} liveSurfaceBounds - Result of `resolveGameSurfaceBounds()`
   * @param {import('../shared/types.js').NormalizedGeometry|null} [referenceGeometry=null]
   * @param {{ xRatio: number, yRatio: number }} [defaultRatio={ xRatio: 0.5, yRatio: 0.5 }]
   * @returns {{ xRatio: number, yRatio: number }}
   */
  static projectPositionToViewport(
    position,
    liveSurfaceBounds,
    referenceGeometry = null,
    defaultRatio = { xRatio: 0.5, yRatio: 0.5 }
  ) {
    const vw = Math.max(liveSurfaceBounds?.viewportWidth || 1, 1);
    const vh = Math.max(liveSurfaceBounds?.viewportHeight || 1, 1);

    const baseX = position?.xRatio !== undefined ? position.xRatio : defaultRatio.xRatio;
    const baseY = position?.yRatio !== undefined ? position.yRatio : defaultRatio.yRatio;

    const refW =
      position?.referenceWidth ||
      position?.viewportWidth ||
      referenceGeometry?.surfaceRefWidth ||
      referenceGeometry?.viewportWidth ||
      0;
    const refH =
      position?.referenceHeight ||
      position?.viewportHeight ||
      referenceGeometry?.surfaceRefHeight ||
      referenceGeometry?.viewportHeight ||
      0;

    const stage = this.resolveEffectiveStageRect(liveSurfaceBounds, { refWidth: refW, refHeight: refH });

    const sX = position?.surfaceXRatio !== undefined ? position.surfaceXRatio : baseX;
    const sY = position?.surfaceYRatio !== undefined ? position.surfaceYRatio : baseY;

    const pixelX = stage.left + sX * stage.width;
    const pixelY = stage.top + sY * stage.height;

    const clampedX = Math.max(vw * 0.05, Math.min(pixelX, vw * 0.95));
    const clampedY = Math.max(vh * 0.05, Math.min(pixelY, vh * 0.95));

    return {
      xRatio: Number((clampedX / vw).toFixed(4)),
      yRatio: Number((clampedY / vh).toFixed(4))
    };
  }

  /**
   * Computes the proportional scale factor for sizing GIF/Image and Text overlays
   * relative to the game surface/viewport dimensions at the time the reaction or region was created.
   *
   * @param {import('../shared/types.js').NormalizedPosition|undefined} position
   * @param {Object} liveSurfaceBounds - Result of `resolveGameSurfaceBounds()`
   * @param {import('../shared/types.js').NormalizedGeometry|null} [referenceGeometry=null]
   * @returns {number} Scale multiplier clamped within `[SCALE_BOUNDS.MIN_SCALE, SCALE_BOUNDS.MAX_SCALE]`
   */
  static computeScaleFactor(position, liveSurfaceBounds, referenceGeometry = null) {
    const refW =
      position?.referenceWidth ||
      position?.viewportWidth ||
      referenceGeometry?.surfaceRefWidth ||
      referenceGeometry?.viewportWidth ||
      0;
    const refH =
      position?.referenceHeight ||
      position?.viewportHeight ||
      referenceGeometry?.surfaceRefHeight ||
      referenceGeometry?.viewportHeight ||
      0;

    if (!refW || !refH || refW <= 0 || refH <= 0) {
      return 1;
    }

    const stage = this.resolveEffectiveStageRect(liveSurfaceBounds, { refWidth: refW, refHeight: refH });
    if (!stage.width || !stage.height) {
      return 1;
    }

    const ratioW = stage.width / refW;
    const ratioH = stage.height / refH;
    const rawScale = Math.min(ratioW, ratioH);

    if (!Number.isFinite(rawScale) || rawScale <= 0) {
      return 1;
    }

    const clamped = Math.max(SCALE_BOUNDS.MIN_SCALE, Math.min(SCALE_BOUNDS.MAX_SCALE, rawScale));
    return Number(clamped.toFixed(4));
  }
}
