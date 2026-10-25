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

  // State
  const state = {
    isSelecting: false,
    targetRegionId: null,
    watchRegion: null,
    baselineImageData: null,
    isMonitoring: false,
    monitorIntervalId: null,
    samplingRateMs: 400,
    thresholdPercent: 12,
    cooldownMs: 3000,
    lastTriggerTimestamp: 0,
    lastDiffPercent: 0,

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
      border: 2px dashed #607DFA;
      background: rgba(96, 125, 250, 0.2);
      pointer-events: none;
    }

    .selection-hint {
      position: absolute;
      top: 16px;
      left: 50%;
      transform: translateX(-50%);
      background: #171B24;
      color: #F4F6FA;
      padding: 10px 18px;
      border-radius: 8px;
      border: 1px solid #374152;
      font-size: 13px;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      box-shadow: 0 10px 25px rgba(0, 0, 0, 0.5);
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
      0% { transform: scale(0.6); opacity: 0; }
      70% { transform: scale(1.08); opacity: 1; }
      100% { transform: scale(1); opacity: 1; }
    }

    @keyframes rAnimSlideTop {
      0% { transform: translateY(-40px); opacity: 0; }
      100% { transform: translateY(0); opacity: 1; }
    }

    @keyframes rAnimShake {
      0%, 100% { transform: translate(0, 0); }
      20% { transform: translate(-8px, 6px); }
      40% { transform: translate(8px, -6px); }
      60% { transform: translate(-6px, -4px); }
      80% { transform: translate(6px, 4px); }
    }

    @keyframes rAnimFadeZoom {
      0% { opacity: 0; transform: scale(0.85); }
      100% { opacity: 1; transform: scale(1); }
    }

    @keyframes rAnimFlash {
      0% { opacity: 1; transform: scale(1); }
      100% { opacity: 0.35; transform: scale(1.04); }
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

    .reposition-top-banner {
      position: fixed;
      top: 16px;
      left: 50%;
      transform: translateX(-50%);
      background: #171B24;
      border: 1px solid #607DFA;
      color: #F4F6FA;
      padding: 10px 20px;
      border-radius: 8px;
      font-size: 13px;
      font-weight: 600;
      font-family: sans-serif;
      box-shadow: 0 10px 25px rgba(0, 0, 0, 0.6);
      pointer-events: none;
      z-index: 2147483647;
      display: flex;
      align-items: center;
      gap: 8px;
    }
  `;
  shadowRoot.appendChild(styleEl);

  const uiContainer = document.createElement('div');
  shadowRoot.appendChild(uiContainer);

  let selectionBackdrop = null;
  let selectionBox = null;
  let repositionEl = null;
  let repositionBannerEl = null;

  // --- Watch Region Selection Logic ---
  function startRegionSelection() {
    if (state.isSelecting) return;
    state.isSelecting = true;
    hostDiv.style.pointerEvents = 'auto';

    selectionBackdrop = document.createElement('div');
    selectionBackdrop.className = 'selection-overlay';
    selectionBackdrop.tabIndex = 0;
    selectionBackdrop.innerHTML = `
      <div class="selection-hint">
        Click and drag to select a Watch Region. Press ESC to cancel.
      </div>
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

        const vw = Math.max(window.innerWidth, 1);
        const vh = Math.max(window.innerHeight, 1);
        const normalizedGeom = {
          x: Number((left / vw).toFixed(4)),
          y: Number((top / vh).toFixed(4)),
          width: Number((width / vw).toFixed(4)),
          height: Number((height / vh).toFixed(4)),
          viewportWidth: vw,
          viewportHeight: vh
        };

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
                        regionId: state.targetRegionId || null,
                        geometry: normalizedGeom,
                        previewUrl: croppedDataUrl,
                        capturedAt: Date.now()
                      }
                    });
                  }

                  if (chrome.runtime && chrome.runtime.sendMessage) {
                    chrome.runtime.sendMessage({
                      action: 'REGION_CAPTURED',
                      regionId: state.targetRegionId || null,
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
   * Cleans up all currently active overlays, timers, and reposition elements
   */
  function clearAllOverlays() {
    state.activeOverlayTimers.forEach((t) => clearTimeout(t));
    state.activeOverlayTimers = [];

    const existing = uiContainer.querySelectorAll('.r-overlay-container, .reposition-top-banner');
    existing.forEach((el) => el.remove());
    repositionEl = null;
    repositionBannerEl = null;
    if (!state.isSelecting && !state.repositionMode) {
      hostDiv.style.pointerEvents = 'none';
    }
  }

  /**
   * Executes a Reaction Configuration overlay without clearing existing concurrent overlays
   * Supports multiple items (GIF + Text together or individually)
   */
  function renderReactionExecution(config) {
    if (!config) return;

    // 1. GIF / Image Reaction
    if (config.gifReaction?.enabled) {
      const g = config.gifReaction;
      const delayMs = (g.delaySeconds || 0) * 1000;
      const durationMs = (g.durationSeconds || 3) * 1000;

      const timerId = setTimeout(() => {
        const itemContainer = document.createElement('div');
        itemContainer.className = 'r-overlay-container anim-pop-in';

        // Normalized Position (viewport percentage)
        const posX = g.position?.xRatio !== undefined ? g.position.xRatio : 0.5;
        const posY = g.position?.yRatio !== undefined ? g.position.yRatio : 0.35;
        itemContainer.style.left = `${posX * 100}%`;
        itemContainer.style.top = `${posY * 100}%`;

        const img = document.createElement('img');
        img.className = 'r-overlay-gif-img';
        img.src = g.fileUrl || 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 200 200"><circle cx="100" cy="100" r="80" fill="%23607DFA" fill-opacity="0.8"/><text x="100" y="108" text-anchor="middle" fill="white" font-size="24" font-family="sans-serif" font-weight="bold">GIF REACTION</text></svg>';
        img.style.width = `${g.size || 180}px`;
        img.style.maxWidth = '90vw';

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
    if (config.textReaction?.enabled) {
      const t = config.textReaction;
      const delayMs = (t.delaySeconds || 0) * 1000;
      const durationMs = (t.durationSeconds || 3) * 1000;

      const timerId = setTimeout(() => {
        const itemContainer = document.createElement('div');
        const animClass = `anim-${t.animationStyle || 'pop-in'}`;
        const fontClass = `font-${t.fontType || 'impact'}`;
        itemContainer.className = `r-overlay-container ${animClass}`;

        // Normalized Position (viewport percentage)
        const posX = t.position?.xRatio !== undefined ? t.position.xRatio : 0.5;
        const posY = t.position?.yRatio !== undefined ? t.position.yRatio : 0.6;
        itemContainer.style.left = `${posX * 100}%`;
        itemContainer.style.top = `${posY * 100}%`;

        const textEl = document.createElement('div');
        textEl.className = `r-overlay-text ${fontClass}`;
        // Strict text sanitization: plain textContent only
        textEl.textContent = t.text || '💥 REACTION!';
        textEl.style.fontSize = `${t.fontSize || 32}px`;
        textEl.style.color = t.fontColor || '#F4F6FA';

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
    state.repositionMode = true;
    state.repositionItemType = itemType;
    hostDiv.style.pointerEvents = 'auto';

    // Initialize original position and current position
    const initX = itemData.position?.xRatio !== undefined ? itemData.position.xRatio : 0.5;
    const initY = itemData.position?.yRatio !== undefined
      ? itemData.position.yRatio
      : (itemType === 'gif' ? 0.35 : 0.6);

    state.repositionOriginalPos = { xRatio: initX, yRatio: initY };
    state.repositionCurrentPos = { xRatio: initX, yRatio: initY };

    // Reposition Top Banner
    repositionBannerEl = document.createElement('div');
    repositionBannerEl.className = 'reposition-top-banner';
    repositionBannerEl.innerHTML = `
      <span>🎯</span>
      <span>Repositioning ${itemType === 'gif' ? 'GIF / Image' : 'Text'} • Drag to place • Click Done in popup</span>
    `;
    uiContainer.appendChild(repositionBannerEl);

    // Draggable Target Container
    repositionEl = document.createElement('div');
    repositionEl.className = 'r-overlay-container reposition-box';
    repositionEl.style.left = `${initX * 100}%`;
    repositionEl.style.top = `${initY * 100}%`;

    // 4 Corner Handles
    ['tl', 'tr', 'bl', 'br'].forEach((pos) => {
      const handle = document.createElement('div');
      handle.className = `reposition-handle ${pos}`;
      repositionEl.appendChild(handle);
    });

    if (itemType === 'gif') {
      const img = document.createElement('img');
      img.className = 'r-overlay-gif-img';
      img.src = itemData.fileUrl || 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 200 200"><circle cx="100" cy="100" r="80" fill="%23607DFA" fill-opacity="0.8"/><text x="100" y="108" text-anchor="middle" fill="white" font-size="20" font-family="sans-serif">REPOSITION ME</text></svg>';
      img.style.width = `${itemData.size || 180}px`;
      repositionEl.appendChild(img);
    } else {
      const textEl = document.createElement('div');
      const fontClass = `font-${itemData.fontType || 'impact'}`;
      textEl.className = `r-overlay-text ${fontClass}`;
      textEl.textContent = itemData.text || '💥 REPOSITION TEXT';
      textEl.style.fontSize = `${itemData.fontSize || 32}px`;
      textEl.style.color = itemData.fontColor || '#F4F6FA';
      repositionEl.appendChild(textEl);
    }

    uiContainer.appendChild(repositionEl);

    // Drag Listener
    let isDragging = false;

    const onPointerDown = (e) => {
      isDragging = true;
      e.stopPropagation();
      e.preventDefault();
    };

    const onPointerMove = (e) => {
      if (!isDragging) return;
      const vw = Math.max(window.innerWidth, 1);
      const vh = Math.max(window.innerHeight, 1);

      // Clamp between 5% and 95% of content viewport
      const clampedX = Math.max(vw * 0.05, Math.min(e.clientX, vw * 0.95));
      const clampedY = Math.max(vh * 0.05, Math.min(e.clientY, vh * 0.95));

      const xRatio = Number((clampedX / vw).toFixed(4));
      const yRatio = Number((clampedY / vh).toFixed(4));

      state.repositionCurrentPos = { xRatio, yRatio };
      repositionEl.style.left = `${xRatio * 100}%`;
      repositionEl.style.top = `${yRatio * 100}%`;
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
    if (request.action === 'RENDER_OVERLAY_PREVIEW') {
      renderReactionPreview(request.config);
      sendResponse({ success: true });
      return true;
    }

    if (request.action === 'RENDER_OVERLAY_REACTION') {
      renderReactionExecution(request.config);
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

    if (request.action === 'TRIGGER_SELECTION' || request.action === 'START_REGION_SELECTION') {
      state.targetRegionId = request.regionId || null;
      startRegionSelection();
      sendResponse({ success: true });
      return true;
    }
  });

  // Support in-page test triggers from test-game.html
  window.addEventListener('message', (event) => {
    if (event.data && event.data.action === 'REACTRON_SIMULATE_REACTION' && event.data.config) {
      renderReactionPreview(event.data.config);
    }
  });

})();
