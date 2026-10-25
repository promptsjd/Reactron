# Reactron Stage 0 Feasibility Spike - Technical Findings & Architecture Report

## 1. Executive Summary
This feasibility spike evaluates the technical feasibility of:
1. Detecting visual state changes within a user-defined rectangular **Watch Region** on any web-based game.
2. Rendering a visual reaction overlay directly on the same game tab, with **zero input interception** during ongoing gameplay.

Both core capabilities have been validated in this spike. Below is the breakdown of capture strategies, permissions, input handling, and the recommended production architecture.

---

## 2. Visual Capture Strategy Analysis

We evaluated three potential strategies for monitoring game regions:

| Strategy | Feasibility | Strengths | Limitations | Verdict |
| :--- | :--- | :--- | :--- | :--- |
| **A. `chrome.tabs.captureVisibleTab` (Background Service Worker)** | **High (Feasible)** | • Works uniformly across WebGL, Canvas 2D, WebGPU, DOM, CSS games.<br>• Immune to cross-origin image tainting.<br>• Does not require modifying or monkey-patching game engine loop. | • Rate-limited by Chrome compositor (~10-15 FPS max recommended to prevent high GPU/CPU usage).<br>• Asynchronous message passing overhead (~15-35ms). | **Recommended for general browser games** |
| **B. Direct Canvas Context Pixel Access (`getImageData` / `readPixels`)** | **Low (Fragile)** | • Low latency if accessible. | • **Fails on tainted canvases** (games loading sprite atlases from CDNs without CORS headers).<br>• **Fails on WebGL/WebGPU** when `preserveDrawingBuffer: false` (default in Three.js, Phaser, Pixi, Godot), where back-buffer is cleared immediately after composite. | **Unsuitable as universal primary strategy** |
| **C. `chrome.tabCapture` / Offscreen Stream** | **Medium (Complex)** | • 60 FPS video stream capability. | • Heavy battery and CPU drain.<br>• Displays persistent browser audio/video capture pill.<br>• Overkill for discrete visual triggers (e.g. HP bar, level banner). | **Reserved for high-frame-rate computer vision if needed later** |

### Selected Implementation
The spike uses **Strategy A (`chrome.tabs.captureVisibleTab`)**:
1. The background service worker executes `chrome.tabs.captureVisibleTab(null, { format: 'png' })`.
2. The content script receives the image data and performs an off-screen crop to the bounding coordinates:
   `cropX = watchRegion.x * devicePixelRatio`
   `cropY = watchRegion.y * devicePixelRatio`
   `cropW = watchRegion.width * devicePixelRatio`
   `cropH = watchRegion.height * devicePixelRatio`
3. Normalized RGB Euclidean difference is computed against the baseline image.
4. When the delta exceeds the threshold (e.g., 12%), the reaction triggers with debounced cooldown.

---

## 3. Overlay Rendering & Zero-Interception Verification

### The Input Interception Challenge
Browser games rely on continuous mouse movement, clicks, dragging, and keyboard controls (WASD, Space, Arrow keys). An extension overlay that introduces an HTML element over the tab could inadvertently trap mouse clicks or lose keyboard focus.

### The Solution
1. **Shadow DOM Encapsulation**:
   All Reactron DOM elements are injected inside a closed/open Shadow Root on `#reactron-spike-host` to prevent game CSS stylesheets from corrupting the overlay or vice versa.
2. **Strict `pointer-events: none !important`**:
   The reaction container and banners enforce `pointer-events: none !important;`.
   - Mouse events (mousedown, mouseup, mousemove, contextmenu, wheel) pass straight through to the underlying `<canvas>` or game element.
   - Keyboard focus is never stolen from the game viewport.
3. **Auto-Dismiss Lifecycle**:
   Overlay disappears after the configured test duration (default 2.5s) using CSS opacity and transform transitions.

---

## 4. Permissions, Security & Browser Restrictions

### Permissions Requested in Manifest V3:
- **`activeTab`**: Grants temporary host access to the current tab when the user clicks the action icon. Avoids requiring scary permanent `<all_urls>` permission prompts in Chrome Web Store.
- **`storage`**: Used for lightweight session options and region coordinates.
- **`scripting`**: Required for dynamic script injection if needed.

### Page Types & Restrictions:
- **Supported**: Standard HTTP/HTTPS web pages, `file://` URLs (if user enables file access in extension settings), WebGL games, HTML5 Canvas 2D games, DOM-based games, itch.io embedded games, Kongregate, Poki, CrazyGames.
- **Restricted by Browser**:
  - `chrome://` and `chrome-extension://` internal pages (blocked by Chrome security policy).
  - Cross-origin `<iframe>` contents: If a game is hosted inside a sandboxed cross-origin iframe without `allow-scripts`, the parent content script captures the visible pixels via tab capture, but element-level DOM queries must use coordinates rather than iframe DOM traversal. `captureVisibleTab` seamlessly captures the iframe visuals.

---

## 5. Known Limitations & Recommended Production Interface

### Limitations Observed in Spike:
1. **Dynamic Resolution & Zoom**:
   If the game canvas dynamically resizes or the browser zoom changes, the pixel offset must recalculate using `window.devicePixelRatio`.
2. **Capture Throttling**:
   Polling `captureVisibleTab` faster than every 250ms can produce Chrome warnings or thermal throttling on low-spec laptops. 300ms–500ms provides optimal battery and responsive detection for game states (e.g., boss HP, death screen, win badge).

### Recommended Production Detection Interface (Stage 1+):
```typescript
interface IWatchRegionService {
  selectRegion(tabId: number): Promise<WatchRegion>;
  captureBaseline(region: WatchRegion): Promise<BaselineProfile>;
  startWatcher(region: WatchRegion, condition: TriggerCondition): Observable<TriggerEvent>;
  stopWatcher(watcherId: string): void;
}

interface IReactionOverlayService {
  renderOverlay(reaction: ReactionConfig, options: OverlayOptions): void;
  dismiss(overlayId: string): void;
}
```

---

## 6. Conclusion & Recommendation
The technical feasibility spike is **SUCCESSFUL**:
- Visual changes inside arbitrary user-selected rectangles can be reliably captured across games.
- Overlays render on top of the active game without blocking mouse or keyboard input.
- Recommendation: Proceed to Stage 1 using the decoupled service interfaces defined in the project architecture rules.
