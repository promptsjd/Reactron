# Contributing to Reactron

Thank you for your interest in contributing to **Reactron**! Whether you are fixing a bug, improving visual detection accuracy, or adding new overlay animation styles, this guide explains how the codebase is structured and how to test your changes locally.

---

## 1. Quick Start for Contributors

The Chrome Extension inside `/extension` is written in **vanilla ES Modules (JavaScript + CSS)** with **zero external runtime dependencies**—meaning you can load `/extension` directly into Chrome without waiting for a bundler.

### Load the Extension in Chrome
1. Clone your fork of the repository:
   ```bash
   git clone https://github.com/<your-username>/reactron.git
   cd reactron
   ```
2. Open Chrome and navigate to `chrome://extensions/`.
3. Enable **Developer mode** (top-right toggle).
4. Click **Load unpacked** and select the `extension/` directory inside this repository.
5. Whenever you edit a file inside `extension/`, click the **Reload (`↻`)** icon on the Reactron card in `chrome://extensions/`.

### Run Tests & Build the Release ZIP
```bash
# Install dev/build dependencies (used for the test runner, ZIP packager, and release portal)
npm install

# Run the automated unit & integration test suite
npm test

# Package the /extension folder into public/reactron-extension.zip
npm run pack-ext
```

---

## 2. Architectural Principles & Separation of Concerns

To keep Reactron lightweight, maintainable, and easy to audit, please follow these core design rules when submitting Pull Requests:

### A. Single Responsibility Per Module
* Keep **UI rendering** (`extension/ui/`), **game management** (`game-management-service.js`), **region management** (`region-management-service.js`), **storage & migrations** (`persistence-service.js`, `media-storage.js`), **visual detection** (`detection-service.js`, `detection-adapter.js`), and **overlay rendering** (`content-script.js`, `overlay-engine.js`) strictly separated.
* UI screens must communicate through defined service interfaces rather than directly mutating `chrome.storage` or `IndexedDB` internals.
* Reuse shared UI components (`extension/ui/components.js`), constants (`extension/services/constants.js`), and validators (`extension/shared/validation.js`) instead of duplicating logic across screens.

### B. Single Source of Truth for Data Schemas
* Shared data models, storage keys, schema versions, and validation boundaries live in `extension/shared/schema.js` and `extension/shared/types.js`.
* If you modify the persisted data model, increment `SCHEMA_VERSION` in `extension/shared/schema.js` and add a corresponding migration step in `MIGRATIONS` so existing users' saved games upgrade seamlessly.

### C. 100% Local-First & Privacy by Design
* Reactron must **never** introduce external telemetry, analytics scripts, remote CDNs, or network calls that transmit user data or screenshots outside the browser.
* All visual viewport comparison must remain strictly in local memory, and all user assets must remain in `chrome.storage.local` and local `IndexedDB`.

### D. Zero Gameplay Interception
* Any changes to `extension/content/content-script.js` must preserve `pointer-events: none !important` on all active reaction overlays so mouse clicks and keyboard controls always pass straight through to the underlying game canvas (except when the user explicitly enters interactive **Reposition Mode** or **Region Selection Mode**).

---

## 3. Submitting a Pull Request

1. Create a feature or bugfix branch from `main`:
   ```bash
   git checkout -b feat/your-feature-name
   ```
2. Add or update unit/integration tests in `tests/reactron.test.js` to cover your changes.
3. Verify that all tests and the TypeScript/Vite build pass:
   ```bash
   npm test
   npm run build
   ```
4. Open a Pull Request with a clear summary of what changed and how to test it.
