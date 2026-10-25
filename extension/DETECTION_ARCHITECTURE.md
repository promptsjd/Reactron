# Reactron Stage 5: Detection Architecture, Supported Games & Limitations

## 1. Overview
Stage 5 connects user-configured Watch Regions and Trigger Conditions to Reactron's existing Shared Overlay Engine. Detection runs behind a dedicated, decoupled `DetectionService` that operates independently from UI state, database persistence, and overlay rendering.

---

## 2. Detection Strategy & Architecture

Reactron uses the proven **Strategy A (`chrome.tabs.captureVisibleTab` + normalized OffscreenCanvas crop)** validated in Stage 0:
1. **Viewport Capture**: The background worker/extension context captures the target window's viewport via `chrome.tabs.captureVisibleTab`.
2. **Normalized Off-screen Crop**: Coordinates are clamped to normalized ratios `(x, y, width, height)` in `[0.0, 1.0]`, scaled by `devicePixelRatio`, and cropped into an in-memory buffer via `OffscreenCanvas`.
3. **Pluggable Adapter (`VisualDiffDetectionAdapter`)**: Normalized RGB Euclidean distance is computed against the baseline crop captured during region setup.
4. **Strictness Mapping (`StrictnessMapper`)**: Centralizes the user-facing Strictness slider (1% – 100%) to algorithm thresholds without hardcoded magic numbers.
5. **Debounce & Cooldown (`TriggerDebouncer`)**: Manages the condition state machine (`IDLE` -> `TRIGGERED` -> `COOLDOWN` -> `SUSTAINED`), preventing rapid duplicate overlay spam while a visual change remains visible.

---

## 3. Strictness Slider Semantics & Formulas

The Strictness slider (1% – 100%, default 75%) provides a consistent, monotonic contract across detection adapters:

| Strictness Setting | Delta Threshold ($\theta$) | Behavior & User Semantics |
| :--- | :--- | :--- |
| **1% (Min Strictness)** | `3.0%` pixel delta | **Highest Sensitivity**: Triggers on subtle pixel variations or small state indicators. Tolerates minor background shifts. |
| **50% (Balanced)** | `14.0%` pixel delta | **Balanced Sensitivity**: Recommended for HP bars, alert banners, and score counters. |
| **75% (Default)** | `19.5%` pixel delta | **Standard Production**: Requires a clear, pronounced change before firing. |
| **100% (Max Strictness)** | `25.0%` pixel delta | **Maximum Strictness**: Requires a decisive visual shift (≥ 25% of the region). Completely immune to ambient particle effects or anti-aliasing jitter. |

### Mathematical Formula:
$$\theta = \theta_{min} + (\theta_{max} - \theta_{min}) \times \frac{S - 1}{99}$$
where $\theta_{min} = 3.0\%$, $\theta_{max} = 25.0\%$, and $S \in [1, 100]$.

For pattern/target matching, tolerance decreases inversely from 30% mismatch (at $S=1$) down to 5% mismatch (at $S=100$, 95%+ exact match).

---

## 4. Debounce & Cooldown State Machine

To prevent uncontrollable reaction loops when a visual condition persists (e.g. boss HP stays at 0%, game-over banner remains displayed), Reactron implements an edge-triggered state machine:

1. **Initial Trigger (`IDLE -> TRIGGERED`)**:
   When measured $\Delta \ge \theta$ on an armed watcher, the debouncer fires, dispatches the reaction to `OverlayEngineService`, and starts the cooldown timer (default: 3000ms).
2. **Sustained Condition (`TRIGGERED -> COOLDOWN -> SUSTAINED`)**:
   While $\Delta \ge \theta$, subsequent sampling ticks are suppressed. Even after the 3000ms cooldown expires, Reactron will **not** re-trigger if the condition has never returned to normal.
3. **Condition Disappearance / Re-arming (`SUSTAINED -> ARMED`)**:
   When $\Delta < (\theta \times 0.85)$ (hysteresis threshold preventing boundary flutter), the watcher re-arms.
4. **Repeated Discrete Events**:
   When an event occurs, clears, and occurs again later, each distinct event triggers the configured reaction.

---

## 5. Supported Game & Page Types

| Game / Page Type | Compatibility | Notes |
| :--- | :--- | :--- |
| **HTML5 Canvas 2D** | **Full Support** | Standard 2D arcade games, platformers, and canvas renderers. |
| **WebGL 1.0 & 2.0** | **Full Support** | Three.js, Phaser, Pixi.js, Babylon.js, Godot HTML5 exports. Immune to `preserveDrawingBuffer: false` back-buffer clears because capture occurs at compositor level. |
| **WebGPU** | **Full Support** | Modern browser graphics engines. |
| **DOM & CSS Games** | **Full Support** | Web-based text games, HTML5 clickers, and CSS-animated games. |
| **Web Portals** | **Full Support** | Poki, itch.io, CrazyGames, Kongregate. |
| **Local Web Servers** | **Full Support** | `http://localhost:*` or local IP test environments. |

---

## 6. Known Limitations & Failure Handling

1. **Internal Browser Pages (`chrome://`, `edge://`, `about:blank`, Chrome Web Store)**:
   - **Limitation**: Google Chrome security policy strictly prohibits extension scripts and tab capture on internal pages.
   - **Handling**: `GameIdentityService` and `DetectionService` detect these URLs at the boundary and report `UNSUPPORTED_PAGE` ("Reactron cannot monitor internal browser pages") on the Dashboard without crashing or silently appearing active.
2. **DRM-Protected Video Buffers**:
   - **Limitation**: Canvases utilizing hardware-protected DRM (Encrypted Media Extensions) blank out during capture.
   - **Handling**: Detection returns zero delta without throwing uncaught exceptions.
3. **Dynamic Canvas Resizing**:
   - If a game canvas changes its CSS layout, normalized coordinates (`0.0 - 1.0`) maintain proportional placement across window resizes.
4. **Compositor Rate Limiting**:
   - Sampling runs at a balanced 400ms (~2.5 FPS) interval to guarantee negligible CPU/GPU impact and zero interference with 60 FPS gameplay.
