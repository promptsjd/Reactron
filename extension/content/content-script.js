/**
 * Reactron Content Script & Shared Overlay Engine (Stage 3)
 * 
 * Capabilities:
 * 1. Interactive rectangular Watch Region selection over game canvas / DOM.
 * 2. Shared Overlay Engine for GIF/Image & Text reactions (unified positioning, timing, animations).
 * 3. Reposition Mode with drag-handles and normalized viewport ratio calculation.
 * 4. Zero-interception guarantee: Overlays enforce `pointer-events: none !important;`
 *    except during deliberate Reposition Mode.
 */

(function () {
  if (window.__REACTRON_INITIALIZED__) return;
  window.__REACTRON_INITIALIZED__ = true;

  console.log('[Reactron] Content script and Overlay Engine initialized.');

  let ViewportLayoutService = null;
  if (typeof chrome !== 'undefined' && chrome.runtime && typeof chrome.runtime.getURL === 'function') {
    import(chrome.runtime.getURL('services/viewport-layout-service.js'))
      .then((mod) => {
        ViewportLayoutService = mod.ViewportLayoutService;
      })
      .catch((err) => {
        console.warn('[Reactron] Failed to load ViewportLayoutService module:', err);
      });
  }

  function resolveSurfaceBoundsSync() {
    if (ViewportLayoutService) {
      return ViewportLayoutService.resolveGameSurfaceBounds(document, window);
    }
    const vw = Math.max(window.innerWidth, 1);
    const vh = Math.max(window.innerHeight, 1);
    return {
      left: 0,
      top: 0,
      width: vw,
      height: vh,
      viewportWidth: vw,
      viewportHeight: vh,
      hasDedicatedSurface: false
    };
  }

  // State
  const state = {
    isSelecting: false,
    targetRegionId: null,
    watchRegion: null,
    lastCapturedGeometry: null,

    // Reposition state
    repositionMode: false,
    repositionItemType: null,
    repositionCurrentPos: { xRatio: 0.5, yRatio: 0.35 },
    repositionOriginalPos: { xRatio: 0.5, yRatio: 0.35 },
    activeOverlayTimers: []
  };

  // Shadow DOM Host
  const hostDiv = document.createElement('div');
  hostDiv.id = 'reactron-host';
  hostDiv.style.cssText = 'position: fixed; inset: 0; z-index: 2147483640; pointer-events: none;';
  document.documentElement.appendChild(hostDiv);

  const shadowRoot = hostDiv.attachShadow({ mode: 'open' });

  // Stylesheet inside Shadow DOM
  const styleEl = document.createElement('style');
  styleEl.textContent = `
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    /* Selection Overlay Backdrop */
    .selection-overlay {
      position: fixed;
      inset: 0;
      background: rgba(15, 23, 42, 0.45);
      cursor: crosshair;
      pointer-events: auto !important;
      z-index: 2147483645;
    }

    .selection-box {
      position: absolute;
      border: 2px dashed #F05A5A;
      background: rgba(240, 90, 90, 0.2);
      pointer-events: none;
    }



    /* =========================================
       SHARED OVERLAY ENGINE STYLES
       ========================================= */

    /* Universal Item Container (Normalized percentage positioning) */
    .r-overlay-container {
      position: fixed;
      transform: translate(-50%, -50%);
      pointer-events: none !important;
      z-index: 2147483646;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      transition: opacity 0.3s ease, transform 0.3s ease;
    }

    .r-overlay-gif-img {
      display: block;
      object-fit: contain;
      pointer-events: none;
      user-select: none;
    }

    .r-overlay-text {
      font-weight: 800;
      text-align: center;
      pointer-events: none;
      user-select: none;
      white-space: pre-wrap;
      line-height: 1.2;
      text-shadow: 0 2px 10px rgba(0, 0, 0, 0.85), 0 0 4px rgba(0, 0, 0, 0.9);
      letter-spacing: -0.01em;
    }

    /* Font Families */
    .font-impact {
      font-family: 'Impact', 'Arial Black', sans-serif;
      letter-spacing: 0.02em;
    }
    .font-inter {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    }
    .font-comic {
      font-family: 'Comic Sans MS', 'Chalkboard SE', cursive, sans-serif;
    }
    .font-mono {
      font-family: 'Courier New', Courier, ui-monospace, monospace;
    }
    .font-serif {
      font-family: 'Georgia', 'Times New Roman', serif;
    }

    /* Animations */
    .anim-pop-in {
      animation: rAnimPopIn 0.35s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards;
    }
    .anim-slide-top {
      animation: rAnimSlideTop 0.35s ease-out forwards;
    }
    .anim-shake-burst {
      animation: rAnimShake 0.4s ease-in-out forwards;
    }
    .anim-fade-zoom {
      animation: rAnimFadeZoom 0.35s ease-out forwards;
    }
    .anim-flash-pulse {
      animation: rAnimFlash 0.5s ease-in-out infinite alternate;
    }

    @keyframes rAnimPopIn {
      0% { transform: translate(-50%, -50%) scale(0.6); opacity: 0; }
      70% { transform: translate(-50%, -50%) scale(1.08); opacity: 1; }
      100% { transform: translate(-50%, -50%) scale(1); opacity: 1; }
    }

    @keyframes rAnimSlideTop {
      0% { transform: translate(-50%, calc(-50% - 40px)); opacity: 0; }
      100% { transform: translate(-50%, -50%); opacity: 1; }
    }

    @keyframes rAnimShake {
      0%, 100% { transform: translate(-50%, -50%); }
      20% { transform: translate(calc(-50% - 8px), calc(-50% + 6px)); }
      40% { transform: translate(calc(-50% + 8px), calc(-50% - 6px)); }
      60% { transform: translate(calc(-50% - 6px), calc(-50% - 4px)); }
      80% { transform: translate(calc(-50% + 6px), calc(-50% + 4px)); }
    }

    @keyframes rAnimFadeZoom {
      0% { opacity: 0; transform: translate(-50%, -50%) scale(0.85); }
      100% { opacity: 1; transform: translate(-50%, -50%) scale(1); }
    }

    @keyframes rAnimFlash {
      0% { opacity: 1; transform: translate(-50%, -50%) scale(1); }
      100% { opacity: 0.35; transform: translate(-50%, -50%) scale(1.04); }
    }

    /* =========================================
       REPOSITION MODE
       ========================================= */

    .reposition-box {
      border: 2px dashed #607DFA !important;
      background: rgba(96, 125, 250, 0.15) !important;
      padding: 6px !important;
      border-radius: 6px !important;
      cursor: grab !important;
      pointer-events: auto !important;
      user-select: none !important;
    }
    .reposition-box:active {
      cursor: grabbing !important;
    }

    .reposition-handle {
      position: absolute;
      width: 10px;
      height: 10px;
      background: #607DFA;
      border: 2px solid #ffffff;
      border-radius: 2px;
      pointer-events: none;
    }
    .reposition-handle.tl { top: -6px; left: -6px; }
    .reposition-handle.tr { top: -6px; right: -6px; }
    .reposition-handle.bl { bottom: -6px; left: -6px; }
    .reposition-handle.br { bottom: -6px; right: -6px; }
  `;
  shadowRoot.appendChild(styleEl);

  const uiContainer = document.createElement('div');
  shadowRoot.appendChild(uiContainer);

  let selectionBackdrop = null;
  let selectionBox = null;
  let repositionEl = null;

  // --- Watch Region Selection Logic ---
  function startRegionSelection() {
    if (state.isSelecting) return;
    clearAllOverlays();
    state.isSelecting = true;
    hostDiv.style.pointerEvents = 'auto';

    selectionBackdrop = document.createElement('div');
    selectionBackdrop.className = 'selection-overlay';
    selectionBackdrop.tabIndex = 0;
    selectionBackdrop.innerHTML = `
      <div class="selection-box" style="display: none;"></div>
    `;
    uiContainer.appendChild(selectionBackdrop);
    selectionBackdrop.focus();

    selectionBox = selectionBackdrop.querySelector('.selection-box');
    let startX = 0;
    let startY = 0;
    let isMouseDown = false;

    const onMouseDown = (e) => {
      isMouseDown = true;
      startX = e.clientX;
      startY = e.clientY;
      selectionBox.style.left = `${startX}px`;
      selectionBox.style.top = `${startY}px`;
      selectionBox.style.width = '0px';
      selectionBox.style.height = '0px';
      selectionBox.style.display = 'block';
    };

    const onMouseMove = (e) => {
      if (!isMouseDown) return;
      const currentX = e.clientX;
      const currentY = e.clientY;

      const left = Math.min(startX, currentX);
      const top = Math.min(startY, currentY);
      const width = Math.abs(currentX - startX);
      const height = Math.abs(currentY - startY);

      selectionBox.style.left = `${left}px`;
      selectionBox.style.top = `${top}px`;
      selectionBox.style.width = `${width}px`;
      selectionBox.style.height = `${height}px`;
    };

    const onMouseUp = () => {
      if (!isMouseDown) return;
      isMouseDown = false;

      const left = parseInt(selectionBox.style.left, 10);
      const top = parseInt(selectionBox.style.top, 10);
      const width = parseInt(selectionBox.style.width, 10);
      const height = parseInt(selectionBox.style.height, 10);

      cleanupSelection();

      if (width > 10 && height > 10) {
        state.watchRegion = { x: left, y: top, width, height };

        const surfaceBounds = resolveSurfaceBoundsSync();
        const vw = surfaceBounds.viewportWidth;
        const vh = surfaceBounds.viewportHeight;

        const normalizedGeom = ViewportLayoutService
          ? ViewportLayoutService.normalizeRegionToSurface(
              { x: left, y: top, width, height },
              surfaceBounds
            )
          : {
              x: Number((left / vw).toFixed(4)),
              y: Number((top / vh).toFixed(4)),
              width: Number((width / vw).toFixed(4)),
              height: Number((height / vh).toFixed(4)),
              viewportWidth: vw,
              viewportHeight: vh
            };

        state.lastCapturedGeometry = normalizedGeom;
        const captureRegionId = state.targetRegionId || null;

        // Wait for two animation frames + brief paint settle so the selection overlay tint
        // and dashed border are completely removed from the compositor before capturing
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            setTimeout(() => {
              if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
                chrome.runtime.sendMessage({ action: 'CAPTURE_VISIBLE_TAB' }, (res) => {
                  if (res && res.dataUrl) {
                    const img = new Image();
                    img.onload = () => {
                      const dpr = window.devicePixelRatio || 1;
                      const cropX = Math.round(left * dpr);
                      const cropY = Math.round(top * dpr);
                      const cropW = Math.round(width * dpr);
                      const cropH = Math.round(height * dpr);
                      const canvas = document.createElement('canvas');
                      canvas.width = cropW;
                      canvas.height = cropH;
                      const ctx = canvas.getContext('2d');
                      if (ctx) {
                        ctx.drawImage(img, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);
                        const croppedDataUrl = canvas.toDataURL('image/png');

                        if (chrome.storage && chrome.storage.local) {
                          chrome.storage.local.set({
                            reactron_last_captured_region: {
                              regionId: captureRegionId,
                              geometry: normalizedGeom,
                              previewUrl: croppedDataUrl,
                              capturedAt: Date.now()
                            }
                          });
                        }

                        if (chrome.runtime && chrome.runtime.sendMessage) {
                          chrome.runtime.sendMessage({
                            action: 'REGION_CAPTURED',
                            regionId: captureRegionId,
                            geometry: normalizedGeom,
                            previewUrl: croppedDataUrl
                          }, () => {
                            if (chrome.runtime.lastError) {
                              // Extension context may have closed or no listener, safe to ignore
                            }
                          });
                        }
                      }
                    };
                    img.src = res.dataUrl;
                  }
                });
              }
            }, 50);
          });
        });
      }
    };

    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        cleanupSelection();
      }
    };

    function cleanupSelection() {
      state.isSelecting = false;
      hostDiv.style.pointerEvents = 'none';
      if (selectionBackdrop) {
        selectionBackdrop.removeEventListener('mousedown', onMouseDown);
        selectionBackdrop.remove();
        selectionBackdrop = null;
      }
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      document.removeEventListener('keydown', onKeyDown, true);
    }

    selectionBackdrop.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    document.addEventListener('keydown', onKeyDown, true);
  }



  // ==========================================
  // SHARED OVERLAY ENGINE IMPLEMENTATION
  // ==========================================

  /**
   * Projects position and proportional scale onto a rendered overlay container
   */
  function applyResponsiveLayoutToOverlay(containerEl) {
    if (!containerEl || !containerEl._reactronMeta) return;
    const meta = containerEl._reactronMeta;
    const surfaceBounds = resolveSurfaceBoundsSync();

    const projectedPos = ViewportLayoutService
      ? ViewportLayoutService.projectPositionToViewport(
          meta.position,
          surfaceBounds,
          meta.referenceGeometry,
          meta.defaultRatio
        )
      : {
          xRatio: meta.position?.xRatio !== undefined ? meta.position.xRatio : meta.defaultRatio.xRatio,
          yRatio: meta.position?.yRatio !== undefined ? meta.position.yRatio : meta.defaultRatio.yRatio
        };

    const scaleFactor = ViewportLayoutService
      ? ViewportLayoutService.computeScaleFactor(
          meta.position,
          surfaceBounds,
          meta.referenceGeometry
        )
      : 1;

    containerEl.style.left = `${projectedPos.xRatio * 100}%`;
    containerEl.style.top = `${projectedPos.yRatio * 100}%`;

    if (meta.type === 'gif' && meta.targetEl) {
      const scaledWidth = Math.max(32, Math.round((meta.baseSize || 180) * scaleFactor));
      meta.targetEl.style.width = `${scaledWidth}px`;
    } else if (meta.type === 'text' && meta.targetEl) {
      const scaledFont = Math.max(12, Math.round((meta.baseFontSize || 32) * scaleFactor));
      meta.targetEl.style.fontSize = `${scaledFont}px`;
    }

    return projectedPos;
  }

  /**
   * Dynamically updates all currently visible overlays when the browser window is resized
   */
  function syncActiveOverlaysWithViewport() {
    const activeEls = uiContainer.querySelectorAll('.r-overlay-container');
    activeEls.forEach((el) => {
      if (el._reactronMeta) {
        const updatedPos = applyResponsiveLayoutToOverlay(el);
        if (el === repositionEl && updatedPos && state.repositionMode) {
          state.repositionCurrentPos = {
            ...state.repositionCurrentPos,
            xRatio: updatedPos.xRatio,
            yRatio: updatedPos.yRatio
          };
        }
      }
    });
  }

  window.addEventListener('resize', syncActiveOverlaysWithViewport);

  /**
   * Cleans up all currently active overlays, timers, and reposition elements
   */
  function clearAllOverlays() {
    state.activeOverlayTimers.forEach((t) => clearTimeout(t));
    state.activeOverlayTimers = [];

    const existing = uiContainer.querySelectorAll('.r-overlay-container');
    existing.forEach((el) => el.remove());
    repositionEl = null;
    if (!state.isSelecting && !state.repositionMode) {
      hostDiv.style.pointerEvents = 'none';
    }
  }

  /**
   * Executes a Reaction Configuration overlay without clearing existing concurrent overlays
   * Supports multiple items (GIF + Text together or individually)
   */
  function renderReactionExecution(config, metadata = {}) {
    if (!config) return;
    const referenceGeometry = metadata?.regionGeometry || state.lastCapturedGeometry || null;
    if (metadata?.regionGeometry) {
      state.lastCapturedGeometry = metadata.regionGeometry;
    }

    // 1. GIF / Image Reaction
    if (config.gifReaction?.enabled && (config.gifReaction.fileUrl || '').trim()) {
      const g = config.gifReaction;
      const delayMs = (g.delaySeconds || 0) * 1000;
      const durationMs = (g.durationSeconds || 3) * 1000;

      const timerId = setTimeout(() => {
        const itemContainer = document.createElement('div');
        itemContainer.className = 'r-overlay-container anim-pop-in';

        const img = document.createElement('img');
        img.className = 'r-overlay-gif-img';
        img.src = g.fileUrl;
        img.style.maxWidth = '90vw';

        itemContainer._reactronMeta = {
          type: 'gif',
          baseSize: g.size || 180,
          position: g.position,
          referenceGeometry,
          defaultRatio: { xRatio: 0.5, yRatio: 0.35 },
          targetEl: img
        };

        applyResponsiveLayoutToOverlay(itemContainer);

        itemContainer.appendChild(img);
        uiContainer.appendChild(itemContainer);

        // Schedule duration cleanup
        const cleanupTimer = setTimeout(() => {
          itemContainer.style.opacity = '0';
          setTimeout(() => itemContainer.remove(), 300);
        }, durationMs);
        state.activeOverlayTimers.push(cleanupTimer);
      }, delayMs);

      state.activeOverlayTimers.push(timerId);
    }

    // 2. Text Reaction
    if (config.textReaction?.enabled && (config.textReaction.text || '').trim()) {
      const t = config.textReaction;
      const delayMs = (t.delaySeconds || 0) * 1000;
      const durationMs = (t.durationSeconds || 3) * 1000;

      const timerId = setTimeout(() => {
        const itemContainer = document.createElement('div');
        const animClass = `anim-${t.animationStyle || 'pop-in'}`;
        const fontClass = `font-${t.fontType || 'impact'}`;
        itemContainer.className = `r-overlay-container ${animClass}`;

        const textEl = document.createElement('div');
        textEl.className = `r-overlay-text ${fontClass}`;
        // Strict text sanitization: plain textContent only
        textEl.textContent = t.text.trim();
        textEl.style.color = t.fontColor || '#F4F6FA';

        itemContainer._reactronMeta = {
          type: 'text',
          baseFontSize: t.fontSize || 32,
          position: t.position,
          referenceGeometry,
          defaultRatio: { xRatio: 0.5, yRatio: 0.6 },
          targetEl: textEl
        };

        applyResponsiveLayoutToOverlay(itemContainer);

        itemContainer.appendChild(textEl);
        uiContainer.appendChild(itemContainer);

        // Schedule duration cleanup
        const cleanupTimer = setTimeout(() => {
          itemContainer.style.opacity = '0';
          setTimeout(() => itemContainer.remove(), 300);
        }, durationMs);
        state.activeOverlayTimers.push(cleanupTimer);
      }, delayMs);

      state.activeOverlayTimers.push(timerId);
    }
  }

  /**
   * Renders a complete Reaction Configuration preview (clears previous preview first)
   */
  function renderReactionPreview(config) {
    clearAllOverlays();
    renderReactionExecution(config);
  }

  // ==========================================
  // REPOSITION MODE IMPLEMENTATION
  // ==========================================

  function startRepositionMode(itemType, itemData) {
    clearAllOverlays();
    if (!itemData) return;
    if (itemType === 'gif' && !(itemData.fileUrl || '').trim()) return;
    if (itemType === 'text' && !(itemData.text || '').trim()) return;

    state.repositionMode = true;
    state.repositionItemType = itemType;
    hostDiv.style.pointerEvents = 'auto';

    const defaultRatio = itemType === 'gif' ? { xRatio: 0.5, yRatio: 0.35 } : { xRatio: 0.5, yRatio: 0.6 };
    const surfaceBounds = resolveSurfaceBoundsSync();
    const referenceGeometry = state.lastCapturedGeometry || null;

    const projectedInit = ViewportLayoutService
      ? ViewportLayoutService.projectPositionToViewport(
          itemData.position,
          surfaceBounds,
          referenceGeometry,
          defaultRatio
        )
      : {
          xRatio: itemData.position?.xRatio !== undefined ? itemData.position.xRatio : defaultRatio.xRatio,
          yRatio: itemData.position?.yRatio !== undefined ? itemData.position.yRatio : defaultRatio.yRatio
        };

    const initialNormalized = ViewportLayoutService
      ? ViewportLayoutService.normalizePositionToSurface(
          projectedInit.xRatio * surfaceBounds.viewportWidth,
          projectedInit.yRatio * surfaceBounds.viewportHeight,
          surfaceBounds
        )
      : { xRatio: projectedInit.xRatio, yRatio: projectedInit.yRatio };

    state.repositionOriginalPos = itemData.position
      ? { ...itemData.position }
      : { ...initialNormalized };
    state.repositionCurrentPos = { ...initialNormalized };

    // Draggable Target Container
    repositionEl = document.createElement('div');
    repositionEl.className = 'r-overlay-container reposition-box';

    // 4 Corner Handles
    ['tl', 'tr', 'bl', 'br'].forEach((pos) => {
      const handle = document.createElement('div');
      handle.className = `reposition-handle ${pos}`;
      repositionEl.appendChild(handle);
    });

    let targetChildEl = null;
    if (itemType === 'gif') {
      const img = document.createElement('img');
      img.className = 'r-overlay-gif-img';
      img.src = itemData.fileUrl;
      repositionEl.appendChild(img);
      targetChildEl = img;
    } else {
      const textEl = document.createElement('div');
      const fontClass = `font-${itemData.fontType || 'impact'}`;
      textEl.className = `r-overlay-text ${fontClass}`;
      textEl.textContent = itemData.text.trim();
      textEl.style.color = itemData.fontColor || '#F4F6FA';
      repositionEl.appendChild(textEl);
      targetChildEl = textEl;
    }

    repositionEl._reactronMeta = {
      type: itemType,
      baseSize: itemData.size || 180,
      baseFontSize: itemData.fontSize || 32,
      position: state.repositionCurrentPos,
      referenceGeometry,
      defaultRatio,
      targetEl: targetChildEl
    };

    applyResponsiveLayoutToOverlay(repositionEl);
    uiContainer.appendChild(repositionEl);

    // Drag Listener (preserves pointer grab offset relative to element center)
    let isDragging = false;
    let grabOffsetX = 0;
    let grabOffsetY = 0;

    const onPointerDown = (e) => {
      isDragging = true;
      const vw = Math.max(window.innerWidth, 1);
      const vh = Math.max(window.innerHeight, 1);
      const currentCenterX = state.repositionCurrentPos.xRatio * vw;
      const currentCenterY = state.repositionCurrentPos.yRatio * vh;
      grabOffsetX = e.clientX - currentCenterX;
      grabOffsetY = e.clientY - currentCenterY;
      e.stopPropagation();
      e.preventDefault();
    };

    const onPointerMove = (e) => {
      if (!isDragging) return;
      const liveSurface = resolveSurfaceBoundsSync();
      const vw = liveSurface.viewportWidth;
      const vh = liveSurface.viewportHeight;

      const targetCenterX = e.clientX - grabOffsetX;
      const targetCenterY = e.clientY - grabOffsetY;

      if (ViewportLayoutService) {
        state.repositionCurrentPos = ViewportLayoutService.normalizePositionToSurface(
          targetCenterX,
          targetCenterY,
          liveSurface
        );
      } else {
        const clampedX = Math.max(vw * 0.05, Math.min(targetCenterX, vw * 0.95));
        const clampedY = Math.max(vh * 0.05, Math.min(targetCenterY, vh * 0.95));
        state.repositionCurrentPos = {
          xRatio: Number((clampedX / vw).toFixed(4)),
          yRatio: Number((clampedY / vh).toFixed(4))
        };
      }

      if (repositionEl._reactronMeta) {
        repositionEl._reactronMeta.position = state.repositionCurrentPos;
      }
      repositionEl.style.left = `${state.repositionCurrentPos.xRatio * 100}%`;
      repositionEl.style.top = `${state.repositionCurrentPos.yRatio * 100}%`;
    };

    const onPointerUp = () => {
      isDragging = false;
    };

    repositionEl.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);

    state._cleanupRepositionDrag = () => {
      if (repositionEl) repositionEl.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    };
  }

  function finishRepositionMode() {
    state.repositionMode = false;
    hostDiv.style.pointerEvents = 'none';
    if (state._cleanupRepositionDrag) state._cleanupRepositionDrag();
    const finalPos = { ...state.repositionCurrentPos };
    clearAllOverlays();
    return finalPos;
  }

  function cancelRepositionMode() {
    state.repositionMode = false;
    hostDiv.style.pointerEvents = 'none';
    if (state._cleanupRepositionDrag) state._cleanupRepositionDrag();
    const origPos = { ...state.repositionOriginalPos };
    clearAllOverlays();
    return origPos;
  }

  // --- Message Dispatcher for Popup & Detection Service ---
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'GET_LIVE_SURFACE_BOUNDS') {
      sendResponse({
        success: true,
        bounds: resolveSurfaceBoundsSync()
      });
      return true;
    }

    if (request.action === 'RENDER_OVERLAY_PREVIEW') {
      renderReactionPreview(request.config);
      sendResponse({ success: true });
      return true;
    }

    if (request.action === 'RENDER_OVERLAY_REACTION') {
      if (!state.isSelecting) {
        renderReactionExecution(request.config, request.metadata || {});
      }
      sendResponse({ success: true });
      return true;
    }

    if (request.action === 'CLEAR_ALL_OVERLAYS') {
      clearAllOverlays();
      sendResponse({ success: true });
      return true;
    }

    if (request.action === 'START_REPOSITION_MODE') {
      startRepositionMode(request.itemType, request.itemData);
      sendResponse({ success: true });
      return true;
    }

    if (request.action === 'FINISH_REPOSITION_MODE') {
      const position = finishRepositionMode();
      sendResponse({ success: true, position });
      return true;
    }

    if (request.action === 'CANCEL_REPOSITION_MODE') {
      cancelRepositionMode();
      sendResponse({ success: true });
      return true;
    }

    if (request.action === 'START_REGION_SELECTION') {
      state.targetRegionId = request.regionId || null;
      startRegionSelection();
      sendResponse({ success: true });
      return true;
    }
  });

  // --- MV3 Service Worker Keep-Alive Heartbeat ---
  // Keeps background service worker awake while the game tab is visible even when the side panel is closed
  const HEARTBEAT_INTERVAL_MS = 20000;

  function sendKeepAliveHeartbeat() {
    if (typeof document !== 'undefined' && document.visibilityState !== 'visible') {
      return;
    }
    if (typeof chrome !== 'undefined' && chrome.runtime && typeof chrome.runtime.sendMessage === 'function') {
      try {
        chrome.runtime.sendMessage({ action: 'KEEP_ALIVE_HEARTBEAT' }, () => {
          if (chrome.runtime.lastError) {
            // Ignore transient runtime errors if extension is reloading
          }
        });
      } catch {
        // Ignore if extension context was invalidated
      }
    }
  }

  sendKeepAliveHeartbeat();
  setInterval(sendKeepAliveHeartbeat, HEARTBEAT_INTERVAL_MS);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      sendKeepAliveHeartbeat();
    }
  });

})();
