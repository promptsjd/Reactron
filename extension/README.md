# Reactron - Stage 0 Technical Feasibility Spike

This is the unpacked Chrome Extension for testing Reactron's two core technical requirements:
1. Detecting visual state changes within a rectangular Watch Region of a game.
2. Rendering a reaction overlay directly in the game tab without intercepting game controls.

---

## Quick Testing Instructions (Chrome / Chromium / Edge / Brave)

### 1. Load the Unpacked Extension in Chrome
1. Open Google Chrome and navigate to: `chrome://extensions/`
2. Enable **"Developer mode"** (toggle in the top-right corner).
3. Click the **"Load unpacked"** button in the top-left.
4. Select this unzipped folder (`extension/`).
5. Pin the **Reactron** extension icon in your Chrome toolbar.

### 2. Test with the Bundled Demo Game
1. Click the **Reactron** extension icon in your toolbar.
2. Click **"🎮 Open Included Test Game"** (or open `test-game.html` in your browser).
3. You will see a playable space blaster game with a **Boss HP bar** and a **Status Badge** in the header.
4. Open the Reactron Spike (via toolbar icon or the bottom-right HUD widget):
   - Click **"📐 Select Watch Region"** and drag a rectangle over the **Target Boss HP** bar or the **Status Badge**.
   - Click **"🎯 Set Baseline"** to memorize the normal state.
   - Click **"▶ Start Monitoring"**.
5. Test the visual trigger:
   - Click **"💥 Simulate Boss Damage"** in the game, or shoot enough falling targets in the game.
   - The visual difference will exceed the threshold (12%), and the **Reaction Overlay** will immediately appear!
6. Verify Non-Interception:
   - While the overlay is displayed, continue moving your mouse, shooting lasers (Left Click / Spacebar), and pressing keys.
   - Notice that your clicks pass completely through the overlay onto the game with **zero lag or blockage**.

### 3. Test on Any Real Web Game
1. Visit any web game (e.g. on Poki, itch.io, CrazyGames).
2. Select any health bar, death screen area, or score counter.
3. Observe reliable trigger reactions and seamless pass-through gameplay.

---

## Technical Feasibility Findings
See `FEASIBILITY_REPORT.md` for complete technical analysis, capture methods trade-offs, and recommended production interfaces.
