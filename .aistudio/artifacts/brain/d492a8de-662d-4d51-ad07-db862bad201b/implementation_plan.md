# Reactron Reaction Configuration & Workflow Refactor Plan

This plan outlines the architectural and user experience redesign of the **Game Setup**, **Reaction Configuration**, **Reaction Library**, and **Dashboard** flows in Reactron. The goal is to streamline reaction creation into a clean, step-by-step, single-reaction-at-a-time workflow (up to 2 reactions per watch region) while eliminating redundant UI controls, hardcoded mock defaults, and unused metadata calculations.

---

## User Review & Critical Decisions

> [!IMPORTANT]
> The following core product decisions have been confirmed and are incorporated into this plan:

- **Confirmed Decision 1 — Reaction Naming & Automatic Labeling**: Removed the 15-character Reaction Name input field completely. Reactions are automatically labeled sequentially based on their slot index (`Reaction 1`, `Reaction 2`) using centralized formatting rules—no hardcoded or duplicate naming logic.
- **Confirmed Decision 2 — Reaction Capacity & Type Flexibility**: Each Watch Region supports up to **2 reactions** added one by one. Each reaction is configured as a single standalone type (`Gif/Image` OR `Text` via radio buttons) with its own unique ID (`reactionId`) and explicit parent-child link (`regionId` -> `gameId`), and either slot can be any type.
- **Confirmed Decision 3 — Library Preset Saving & Duplicate Handling**: When `Save to Reaction Library` is checked, presets are saved with unique internal IDs (`preset.id`) and displayed with the most recent reaction at the top (`createdAt` / `updatedAt` descending) without blocking or overwriting on duplicate labels.
- **Confirmed Decision 4 — Single Watch Region Focus & Dashboard Card Simplification**: The `"Add Another Region"` button is removed so each game setup focuses on its primary Watch Region (supporting up to 2 reactions), and the Dashboard game cards no longer compute or render the regions/reactions metadata summary row or status badge text.

---

## 1. Overview & Core Concept

- **What It Does**: Replaces the dual-tab ("Independent Reactions") editor with a guided, radio-button-driven single-reaction workflow directly below the Watch Region's Strictness slider. Users first select an on-screen area to unlock the `"Gif/Image"` and `"Text"` radio options, configure one reaction at a time, preview it immediately on the game tab, optionally save it to the Reaction Library, and collapse it into a clean summary row (`Reaction 1`, `Reaction 2`).
- **Target Audience / Persona**: Browser gamers configuring custom visual overlays who want a fast, uncluttered setup without managing nested enable/disable checkboxes or mandatory naming constraints.
- **Key Value**: Eliminates state confusion (such as disabled tabs still holding mock data like `"Victory Explode"` / `"Victory Text"`), enforces strict parent-child entity links (`Game -> WatchRegion -> ReactionConfig`), and keeps all modules decoupled.

---

## 2. User Experience & Visual Design

### Key User Flows

1. **Dashboard View (Screen A)**:
   - Displays saved games in a clean list below the top action bar (`Add Game` and `Library`).
   - **Game Card Simplification**: Each game card displays **only** the Game Name, the Delete icon button, and the right-aligned Enable/Disable toggle switch. All code computing or rendering watch region counts, reaction counts, status badges, and monitoring subtext is removed.
2. **Game Setup — Top & Watch Region (Screen B)**:
   - User clicks `Add Game` on the Dashboard and lands on the Game Setup page.
   - **Unchanged Top Controls**: `Back to Dashboard` header, `Game Tab URL` display, `Game Name` input (15-char limit), `Watch Regions` header, `Select Area` button + helper text, Region Preview frame (with top-right clear button), and `Strictness` slider remain intact.
   - **Initial Region State**: When adding a game or before an area is captured (`!region.geometry || !region.previewUrl`), the reaction type radio buttons (`"Gif/Image"` and `"Text"`) are rendered directly below the Strictness slider in a **disabled** state.
3. **Selecting Reaction Type & Configuring Settings (Screen B / C)**:
   - Once an area is selected on the game tab (`region.previewUrl` & `region.geometry` exist), the `"Gif/Image"` and `"Text"` radio buttons become **enabled**.
   - **Removed Clutter**: The `"Independent Reactions"` notice box and the `"Enable GIF / Image in this reaction"` / `"Enable Text in this reaction"` checkboxes are completely removed.
   - Clicking either `"Gif/Image"` or `"Text"` radio button immediately reveals the configuration settings for that chosen type:
     - **If `"Gif/Image"` is selected**:
       1. `Load from Library` selector (shows saved GIF/Image presets, most recent on top)
       2. `Select File` upload & thumbnail preview box (using a clean neutral filler placeholder instead of `"Victory Explode"`)
       3. `Overlay Size` slider (`80px` – `400px`)
       4. `Reposition GIF/Image` button
       5. `Preview` button (triggers overlay preview immediately when clicked, independent of delay/duration sliders)
       6. `Trigger Delay` slider (`0s` – `3s`)
       7. `Display Duration` slider (`1s` – `10s`)
       8. `Save to Reaction Library` checkbox
       9. `Cancel` and `Save` buttons
     - **If `"Text"` is selected**:
       1. `Load from Library` selector (shows saved Text presets, most recent on top)
       2. `Reaction Text` input (uses a clean filler placeholder/default instead of `"Victory Text"` / `"💥 BOSS CRUSHED!"`)
       3. `Font Size` & `Font Color` selectors
       4. `Font Type` & `Animation Style` selectors
       5. `Reposition Text` button
       6. `Preview` button (triggers immediate preview on the active tab without waiting for trigger delay)
       7. `Trigger Delay` slider (`0s` – `3s`)
       8. `Display Duration` slider (`1s` – `10s`)
       9. `Save to Reaction Library` checkbox
       10. `Cancel` and `Save` buttons
4. **Saving a Reaction & Adding a Second Reaction**:
   - Clicking **`Save`** on the reaction collapses the editor into a compact summary bar displaying only its generated label (`Reaction 1` or `Reaction 2`) with `Edit` and `Remove` controls.
   - Directly beneath `Reaction 1`, an **`Add Another Reaction`** button appears (up to the maximum of 2 reactions per region).
   - Clicking `Add Another Reaction` opens a second reaction slot (`Reaction 2`) with the `"Gif/Image"` and `"Text"` radio buttons ready to configure. Once 2 reactions exist on the region, the `Add Another Reaction` button is hidden.
   - The **`Add Another Region`** button is removed.
   - At the bottom of the screen, the **`Save Game Configuration`** button persists the entire game, region, and reactions atomically.
5. **Reaction Library (Screen D)**:
   - The **search bar is removed**.
   - The **`GIF / Image Reactions`** and **`Text Reactions`** tabs remain.
   - Displays only user-usable reactions ordered with the **most recent reaction at the top**.

### Visual Identity & Theme
- **Aesthetic Direction**: Utilitarian dark-mode gaming side-panel adhering strictly to Reactron's shared design tokens (`--app-bg: #171B24`, `--panel-bg: #222936`, `--primary: #607DFA`, `--text-main: #F4F6FA`, `--text-secondary: #A9B3C4`, `--border: #374152`).
- **Component Styling & Layout**: Single-elevation cards (`1px solid #374152`), accessible radio button group for `"Gif/Image"` and `"Text"` with clear disabled states (`opacity: 0.45; cursor: not-allowed` when no watch area is selected), and tabular numerals (`font-mono`) on sliders.

---

## 3. Key Product Decisions & Trade-Offs

- **Decision 1: Single-Type Reaction Entity with Parent/Child IDs vs. Dual-Sub-Object Config**
  - *Chosen Approach*: Each reaction in `region.reactionConfigs` (max 2) represents a single reaction with its own unique `id`, `regionId` (parent link), `type` (`'gif'` | `'text'`), and corresponding settings payload (`gifReaction` or `textReaction`).
  - *Why*: Eliminates the confusing state where a single reaction row could hold both a GIF and a Text reaction simultaneously or keep hidden mock defaults enabled in the background. The detection and overlay engines can still iterate over `region.reactionConfigs` seamlessly using the exact same parent-child relationship.
  - *Alternatives Considered*: Keeping both `gifReaction` and `textReaction` active inside one config item was rejected because the user journey requires selecting one reaction type at a time via radio buttons and adding up to 2 reactions sequentially.

- **Decision 2: Immediate Preview Execution Decoupled from Trigger Delay**
  - *Chosen Approach*: Placed the `Preview` button directly after the `Reposition` button and above `Trigger Delay` and `Display Duration`. Clicking `Preview` dispatches the preview overlay with `delaySeconds: 0` (and a fixed preview visibility window) so the user sees the overlay immediately on click.
  - *Why*: Users testing placement and styling after repositioning need instant visual feedback on the active tab rather than waiting for a configured trigger delay.

- **Decision 3: Centralized Dynamic Labeling & Filler Constants**
  - *Chosen Approach*: Centralize the reaction slot limit (`MAX_REACTIONS_PER_REGION = 2`), default filler values (e.g., neutral sample text/image placeholders in shared constants/mock-data), and dynamic index-based label generation (`formatConfigurationLabel(config, index)` returning `Reaction ${index + 1}`) in shared service/constant modules.
  - *Why*: Guarantees zero hardcoded strings in UI components, zero duplicate naming rules, and effortless future changes if default fillers or limits are adjusted in later stages.

---

## 4. Technical Architecture & Data Strategy *(Technical Reference)*

### Architecture & Component Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        Extension Popup / Side Panel                     │
│                                                                         │
│  ┌──────────────────────┐   ┌───────────────────────┐   ┌────────────┐  │
│  │  Screen A: Dashboard │   │ Screen B: Game Setup  │   │ Screen D:  │  │
│  │  (Name + Toggle +    │──▶│ • URL & Game Name     │   │  Library   │  │
│  │   Delete only)       │   │ • 1 Watch Region      │   │ • No Search│  │
│  └──────────────────────┘   │ • Select Area & Strict│   │ • Recent   │  │
│                             │ • Reaction 1 / 2 Rows │   │   on Top   │  │
│                             └───────────┬───────────┘   └──────▲─────┘  │
│                                         │                      │        │
│                                         ▼                      │        │
│                             ┌───────────────────────┐          │        │
│                             │ Screen C: Reaction    │          │        │
│                             │ Editor (Radio Mode)   │──────────┘        │
│                             │ • Radio: Gif/Image    │ (Save to Library) │
│                             │          | Text       │                   │
│                             │ • Disabled if !area   │                   │
│                             │ • Reposition ->       │                   │
│                             │   Immediate Preview   │                   │
│                             │ • Delay & Duration    │                   │
│                             │ • Cancel / Save       │                   │
│                             └───────────┬───────────┘                   │
└─────────────────────────────────────────┼───────────────────────────────┘
                                          │
           ┌──────────────────────────────┼──────────────────────────────┐
           ▼                              ▼                              ▼
┌─────────────────────┐      ┌─────────────────────────┐    ┌─────────────────────┐
│ RegionManagement    │      │ PersistenceService      │    │ OverlayEngineService│
│ Service             │      │ & SchemaValidator       │    │ & DetectionService  │
│ • Max 2 Reactions   │      │ • Game -> Region ->     │    │ • Immediate Preview │
│ • Dynamic "Reaction │      │   Reaction ID links     │    │   (0s delay)        │
│   1/2" Formatter    │      │ • Recent-first Library  │    │ • Production Trigger│
│ • Clean Fillers     │      │   without name collision│    │   uses saved Delay &│
└─────────────────────┘      └─────────────────────────┘    │   Duration          │
                                                            └─────────────────────┘
```

### Data Model & State Relationships

1. **Parent-Child Hierarchy**:
   - `GameEntry` (`id`) $\longrightarrow$ owns `watchRegions` (1 region initialized by default when entering Game Setup, with `region.gameId = game.id`).
   - `WatchRegion` (`id`, `gameId`, `geometry`, `previewUrl`, `strictness`) $\longrightarrow$ owns `reactionConfigs` (0 to 2 items, each with `config.id` and `config.regionId = region.id`).
   - `ReactionConfig` (`id`, `regionId`, `type: 'gif' | 'text' | null`, `gifReaction`, `textReaction`):
     - When `type === 'gif'`, `gifReaction.enabled = true` and `textReaction` is omitted/`null`.
     - When `type === 'text'`, `textReaction.enabled = true` and `gifReaction` is omitted/`null`.
     - Display label is dynamically derived from its position in `region.reactionConfigs` (`Reaction 1`, `Reaction 2`) via `RegionManagementService.formatConfigurationLabel(config, index)`.
2. **Removal of Legacy Mock Reactions**:
   - Remove `"Victory Explode"`, `"Victory Text"`, and `"💥 BOSS CRUSHED!"` from `RegionManagementService.createReactionConfiguration`.
   - Use centralized, easily replaceable filler constants (defined in shared configuration/mock-data) for initial blank/draft states (such as a clean placeholder label for text input and neutral image placeholder state).
3. **Library Preset Storage & Ordering**:
   - When `saveToLibrary` is checked on a reaction, `PersistenceService` generates a unique `id` and uses the generated label (`Reaction 1` / `Reaction 2`) without overwriting existing presets of the same label.
   - `getLibraryPresets(type)` returns presets sorted by `createdAt` / `updatedAt` descending (most recent on top) and filters to valid, usable presets.

### Interactive Component & State Mapping

- **Dashboard Card Rendering**:
  - Remove `regionsCount`, `configuredReactionsCount`, `statusBadge`, and `metaEl` DOM creation and calculation from the Dashboard game item loop.
- **Watch Region & Radio Gate**:
  - When a game is opened in Game Setup, ensure 1 Watch Region container is present so the user sees the `Select Area` button, preview frame, `Strictness` slider, and the disabled `"Gif/Image"` / `"Text"` radio buttons immediately below it.
  - Selecting or clearing the region area (`region.previewUrl` and `region.geometry`) dynamically toggles the disabled state of the `"Gif/Image"` and `"Text"` radio buttons.
- **Single Reaction Editor Lifecycle**:
  - Selecting a radio button (`"Gif/Image"` or `"Text"`) renders the corresponding control stack in the exact requested order:
    - Preset Dropdown $\rightarrow$ Media/Text Inputs & Style Controls $\rightarrow$ `Reposition` button $\rightarrow$ `Preview` button $\rightarrow$ `Trigger Delay` slider $\rightarrow$ `Display Duration` slider $\rightarrow$ `Save to Reaction Library` checkbox $\rightarrow$ `Cancel` / `Save` buttons.
  - Clicking `Preview` calls `OverlayEngineService.previewReaction` with a transient copy of the active reaction where `delaySeconds = 0` so the preview appears immediately on click.
  - Clicking `Save` validates the reaction, collapses the row to show only its label (`Reaction 1` or `Reaction 2`) with `Edit` / `Delete` actions, and reveals the `Add Another Reaction` button below it (if `region.reactionConfigs.length < 2`).
  - Clicking `Cancel` discards unsaved edits (or removes the unsaved draft slot if it was newly added) and collapses/restores the previous state.
