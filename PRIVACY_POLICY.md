# Privacy Policy for Reactron - Custom Game Reactions

**Effective Date:** October 26, 2026  
**Extension Name:** Reactron - Custom Game Reactions  
**Version:** 1.0.0  
**Contact Email:** promptsmithjd@gmail.com

---

## 1. Overview & Zero Data Collection Commitment

**Reactron - Custom Game Reactions** ("Reactron", "we", "our", or "the Extension") is designed from the ground up as a **100% local, privacy-first browser extension**. 

* **We do NOT collect, transmit, store on external servers, rent, or sell any personal data, browsing history, tab activity, screenshots, or user-uploaded media.**
* **Reactron operates with zero backend servers, zero third-party analytics scripts, and zero external network requests.**

---

## 2. How Reactron Uses Browser Permissions Locally

To provide custom visual reaction overlays on browser-based games, Reactron requests specific Chrome Extension permissions. Every permission is used strictly on your local device:

### A. Visual Tab Capture (`activeTab`, `tabs`, and `captureVisibleTab`)
* **How it works:** When you enable monitoring for a saved game tab, Reactron periodically samples the visible viewport of that active game tab (`chrome.tabs.captureVisibleTab`) to compare the pixels inside your selected **Watch Region** against the baseline thumbnail you captured during setup.
* **Privacy guarantee:** Frame captures are processed **strictly in volatile local memory (RAM)** on your device to calculate a `12×12` RGB color similarity score and are immediately discarded. Only the small cropped preview thumbnail of the Watch Region you explicitly select is saved locally in your browser storage so you can see what region you selected. No screenshots or images are ever transmitted over the network.

### B. Local Storage (`storage` and `IndexedDB`)
* **How it works:** Reactron uses `chrome.storage.local` and your browser's local `IndexedDB` (`reactron_media_db`) to save your configured games, Watch Region coordinates, strictness slider settings, custom text reactions, and uploaded GIF/image files.
* **Privacy guarantee:** All configuration data and media files remain exclusively on your computer. Deleting a game, deleting a library preset, or uninstalling the Reactron extension permanently removes this data from your browser.

### C. Host Permissions (`<all_urls>`) and Content Scripts (`scripting`)
* **How it works:** Browser-based games are hosted across thousands of independent domains, portals, and self-hosted URLs. Reactron requires `<all_urls>` and `scripting` solely to:
  1. Let you draw a Watch Region selection box on whatever browser game site you choose to play.
  2. Render your configured GIF/image and text overlays inside an isolated Shadow DOM container on that game tab.
* **Privacy guarantee:** Reactron remains idle and performs no visual sampling on any website that does not match an enabled game URL in your Reactron Dashboard. Reactron never reads form inputs, passwords, cookies, or personal page text.

### D. Side Panel (`sidePanel`)
* **How it works:** Used to display the Reactron control panel alongside your active browser tab so you can configure Watch Regions and preview reactions without covering the game screen.

---

## 3. Third-Party Services & External Network Requests

Reactron makes **no external network requests** (`fetch` or `XMLHttpRequest` to remote servers) and embeds **no third-party tracking SDKs, telemetry, or remote fonts**. All code, stylesheets, and assets are bundled directly inside the extension package.

---

## 4. Your Control Over Your Data

You have complete control over all data stored locally by Reactron:
* **View & Edit:** Open the Reactron Side Panel at any time to view, edit, or disable any saved game, Watch Region, or Library preset.
* **Delete Individual Items:** Deleting a game or library preset in the UI immediately removes its configuration from `chrome.storage.local` and automatically purges any unreferenced GIF/image blobs from local `IndexedDB`.
* **Complete Removal:** Uninstalling Reactron from Google Chrome (`chrome://extensions`) automatically and permanently erases all local extension storage and IndexedDB databases associated with the extension.

---

## 5. Changes to This Privacy Policy

If future versions of Reactron introduce any changes that affect how data is handled, we will update this Privacy Policy and revise the "Effective Date" at the top of this page prior to releasing the update.

---

## 6. Contact Us

If you have any questions, concerns, or requests regarding this Privacy Policy or Reactron's privacy practices, please contact the developer at:

* **Email:** [promptsmithjd@gmail.com](mailto:promptsmithjd@gmail.com)
