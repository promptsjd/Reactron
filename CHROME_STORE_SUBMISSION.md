# Chrome Web Store Submission Guide — Reactron v1.0.0

Use this reference when filling out the **Chrome Web Store Developer Dashboard** (`Store Listing` and `Privacy Practices` tabs).

---

## 1. Package to Upload

* **File to upload:** `public/reactron-extension.zip` (or zip the `/extension` directory directly).
* **Manifest Version:** 3
* **Extension Version:** `1.0.0`
* **Minimum Chrome Version:** `114`

---

## 2. Store Listing Copy (Copy & Paste)

### Title
`Reactron - Custom Game Reactions`

### Summary (132 characters max — actual: 109 chars)
`Configurable text and GIF/image reaction overlays for browser-based games, triggered by HUD visual changes.`

### Category
`Fun` (or `Workflow & Planning` / `Accessibility`)

### Detailed Description
```text
Reactron brings custom GIF/image and animated text reaction overlays to any browser-based game—triggered automatically by visual changes on your game HUD.

Whether you want a celebratory GIF to pop up when a "VICTORY" banner appears, a bold text alert when a round ends, or custom visual flair on your favorite web games, Reactron runs alongside your game in Chrome's Side Panel with zero lag and zero mouse-click interference.

KEY FEATURES (v1.0):
• Side Panel Workflow: Configure Watch Regions and preview reactions right beside your game without covering the viewport.
• Visual Watch Regions: Draw up to 2 Watch Regions per game directly over any HTML5 Canvas, WebGL, or DOM HUD indicator.
• Custom GIF & Text Overlays: Combine uploaded GIFs/PNGs/JPEGs with styled, animated text overlays (Pop-In, Slide-Top, Shake-Burst, Fade-Zoom, Flash-Pulse).
• Live Drag-and-Drop Repositioning: Position overlays anywhere on screen with interactive drag handles and automatic window-resize scaling.
• Tunable Strictness & Smart Cooldowns: Adjust the 1%–100% Strictness Slider to control visual match sensitivity while built-in debouncing prevents repeat spam.
• Reusable Reaction Library: Save your favorite GIF and text presets to reuse across any game with one click.
• Zero Click Interception: Overlays render inside an isolated Shadow DOM with pointer-events disabled during gameplay, so your clicks and keystrokes never get blocked.
• 100% Local & Private: All visual comparison happens in local memory and all assets stay on your device. Zero external servers, zero analytics, and zero data collection.

KNOWN LIMITATIONS:
• Works best on stable, high-contrast HUD elements (banners, icons, score cards). Busy 3D backgrounds with constant motion behind semi-transparent UI may reduce detection accuracy.
• Requires the game tab to be the active foreground tab in a visible browser window.
• Cannot run on restricted browser pages (chrome://, Chrome Web Store).
```

---

## 3. Privacy Practices Tab — Permission Justifications (Copy & Paste)

### Single Purpose Description
```text
The single purpose of Reactron is to let users select visual Watch Regions on browser-based games and display user-configured GIF/image and text reaction overlays when those regions match the captured visual state.
```

### Permission Justifications

1. **`activeTab`**
   ```text
   Required to identify the user's currently open browser game tab when clicking "+ Add Game from Active Tab", to initiate interactive Watch Region selection, and to capture visible viewport pixels (via captureVisibleTab) strictly for local in-memory visual comparison against the user's saved Watch Regions.
   ```

2. **`storage`**
   ```text
   Required to store user-configured game entries, normalized Watch Region coordinates, strictness slider settings, and reaction preset metadata locally on the user's device via chrome.storage.local.
   ```

3. **`scripting`**
   ```text
   Required to ensure the Watch Region selector and Shadow DOM reaction overlay script (content-script.js) are injected and responsive on the active game tab immediately when the user triggers area selection or live overlay preview from the Side Panel, without forcing the user to reload their game mid-session.
   ```

4. **`sidePanel`**
   ```text
   Required to host the Reactron configuration interface inside Chrome's native Side Panel so users can select Watch Regions, drag-and-drop overlay positions, and preview reactions side-by-side with their live game viewport.
   ```

5. **`tabs`**
   ```text
   Required to match open tab URLs against the user's enabled games list, automatically start or pause visual monitoring when the user navigates away or switches tabs, and route overlay trigger messages to the active game tab.
   ```

6. **`host_permissions` (`<all_urls>`)**
   ```text
   Browser-based web games are hosted across thousands of independent domains, game portals, and custom URLs. <all_urls> is required so users can select Watch Regions, sample viewport regions via captureVisibleTab, and render reaction overlays on whichever web game URL they add to their Reactron Dashboard. Monitoring only runs on tabs matching a user-enabled game URL.
   ```

### Remote Code Declaration
* **Are you using remote code?** Select **"No, I am not using remote code"**
* *Explanation (if prompted):* All JavaScript, CSS, and UI assets are bundled locally within the extension package. No external scripts, CDNs, or `eval()` calls are used.

### Data Usage Checkboxes
* Uncheck **all** data collection categories (Reactron collects **no** user data).
* Check all three required certification boxes confirming compliance with the Chrome Web Store Developer Program Policies.

---

## 4. Official Privacy Policy URL & Contact

* **Contact Email:** `promptsmithjd@gmail.com`
* **Privacy Policy URL:** Use your deployed portal URL with `#privacy` (e.g., `https://ais-pre-fadpsi4kegyiprz6wuwl57-452757667321.asia-southeast1.run.app/#privacy`)
