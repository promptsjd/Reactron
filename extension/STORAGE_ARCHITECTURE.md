# Reactron: Authoritative Persistence Architecture & Storage Documentation

**Version:** 1.0 (Stage 4)  
**Schema Version:** `SCHEMA_VERSION = 1`  
**Primary Authoritative Service:** `extension/services/persistence-service.js`  
**Binary Storage Service:** `extension/services/media-storage.js` (IndexedDB)  
**Schema & Migration Registry:** `extension/shared/schema.js`

---

## 1. Architectural Overview & Separation of Concerns

Reactron strictly enforces separation of concerns across all extension subsystems:
- **Persistence Layer (`PersistenceService`):** Single authoritative service responsible for storing and retrieving structured entities, managing transactions, running migrations, and ensuring data integrity.
- **Binary Media Storage (`MediaStorageService`):** Dedicated IndexedDB adapter (`reactron_media_db`, store `media_blobs`) to hold raw image and animated GIF blobs without exhausting Chrome Storage extension quotas.
- **UI State & Views (`screen-dashboard.js`, `screen-game-setup.js`, `screen-reaction-editor.js`, `screen-library.js`):** Consume high-level service interfaces (`gameManagementService`, `persistenceService`, `mediaStorage`). UI components never access storage APIs directly.
- **Detection & Overlay Runtime (`OverlayEngineService`, `content-script.js`):** Pure runtime engines that execute independently of storage internals.

```
┌────────────────────────────────────────────────────────┐
│                      Reactron UI                       │
│    (Dashboard, Game Setup, Reaction Editor, Library)   │
└───────────────────────────┬────────────────────────────┘
                            │
               ┌────────────▼───────────┐
               │ Game Management Service│
               └────────────┬───────────┘
                            │
         ┌──────────────────▼──────────────────┐
         │     Authoritative Persistence       │
         │      (PersistenceService v1)        │
         └─────────────┬──────────────┬────────┘
                       │              │
      ┌────────────────▼──────┐ ┌─────▼──────────────────┐
      │  chrome.storage.local │ │ IndexedDB (Media Store)│
      │  - Games metadata     │ │ - Binary GIF/PNG Blobs │
      │  - Watch Regions      │ │ - Content Deduplication│
      │  - Reaction Configs   │ │ - Stable mediaAssetIds │
      │  - Library Presets    │ │ - Orphan Garbage Coll. │
      │  - Schema Version     │ └────────────────────────┘
      └───────────────────────┘
```

---

## 2. Documented Data Schema & Entities

### 2.1 Game Entity (`GameEntry`)
- **`id`** (`string`): Stable internal UUID (e.g., `game_a1b2c3d4`). Never uses raw URL as primary key.
- **`name`** (`string`): User-entered game name, strictly 1–15 characters, unique across all saved games.
- **`url`** (`string`): Original Chrome tab URL.
- **`canonicalIdentity`** (`string`): Normalized identity key derived by `GameIdentityService` (protocol, hostname, path, sorted query parameters).
- **`isEnabled`** (`boolean`): Active toggle state. When disabled, the game is retained in storage but monitoring and overlay triggers are suspended.
- **`watchRegions`** (`Array<WatchRegion>`): Relational array of child watch regions.
- **`createdAt`** / **`updatedAt`** (`number`): Unix epoch timestamps.

### 2.2 Watch Region Entity (`WatchRegion`)
- **`id`** (`string`): Stable internal region identifier (e.g., `region_e5f6g7h8`).
- **`gameId`** (`string`): Foreign key referencing parent Game ID.
- **`name`** (`string`): Display name (e.g., `Watch Region 1`).
- **`strictness`** (`number`): Strictness threshold percentage (1 to 100).
- **`geometry`** (`NormalizedGeometry | null`): Normalized coordinates (`x`, `y`, `width`, `height`, `viewportWidth`, `viewportHeight`) relative to content viewport (0.0 to 1.0).
- **`previewUrl`** (`string | null`): Cropped visual preview thumbnail of the captured area.
- **`reactionConfigs`** (`Array<ReactionConfig>`): Associated reaction configurations.

### 2.3 Reaction Configuration Entity (`ReactionConfig`)
- **`id`** (`string`): Stable configuration identifier.
- **`regionId`** (`string`): Foreign key referencing parent Watch Region ID.
- **`customTitle`** (`string`): Optional user-entered title override.
- **`gifReaction`** (`GifImageReaction | undefined`): Optional GIF/Image reaction settings.
- **`textReaction`** (`TextReaction | undefined`): Optional Text reaction settings.
- **`updatedAt`** (`number`): Unix epoch timestamp.

### 2.4 GIF / Image Reaction (`GifImageReaction`)
- **`enabled`** (`boolean`): Active toggle for GIF overlay.
- **`name`** (`string`): User-entered name (max 15 characters).
- **`mediaAssetId`** (`string | null`): Stable ID referencing binary blob in IndexedDB.
- **`fileUrl`** (`string`): Lightweight preview data URL or asset path.
- **`fileName`** (`string`): Original uploaded file name (e.g., `victory.gif`).
- **`size`** (`number`): Overlay rendered width in pixels (80 to 400).
- **`delaySeconds`** (`number`): Delay before overlay appears (0.0 to 3.0s in 0.5s increments).
- **`durationSeconds`** (`number`): Display duration (1.0 to 10.0s).
- **`position`** (`NormalizedPosition`): Center coordinates `{ xRatio, yRatio }` (0.0 to 1.0).

### 2.5 Text Reaction (`TextReaction`)
- **`enabled`** (`boolean`): Active toggle for text overlay.
- **`name`** (`string`): User-entered name (max 15 characters).
- **`text`** (`string`): Sanitized text string rendered on screen.
- **`fontSize`** (`number`): Font size in pixels (18 to 56).
- **`fontColor`** (`string`): Hex color code (e.g., `#F4F6FA`).
- **`fontType`** (`string`): Font choice (`impact`, `inter`, `comic`, `mono`, `serif`).
- **`animationStyle`** (`string`): Entrance animation (`pop-in`, `slide-top`, `shake-burst`, `fade-zoom`, `flash-pulse`).
- **`delaySeconds`** (`number`): Delay before overlay appears (0.0 to 3.0s in 0.5s increments).
- **`durationSeconds`** (`number`): Display duration (1.0 to 10.0s).
- **`position`** (`NormalizedPosition`): Center coordinates `{ xRatio, yRatio }` (0.0 to 1.0).

### 2.6 Library Preset (`LibraryPreset`)
- **`id`** (`string`): Stable preset ID (e.g., `lib_preset_170000_abcd`).
- **`type`** (`'gif' | 'text'`): Discriminator tag.
- **`name`** (`string`): Reusable reaction name (max 15 characters).
- **`summary`** (`string`): Concise subtitle descriptor.
- **`mediaAssetId`** (`string | null`): Media asset reference for GIF presets.
- **`content`** (`object`): Cloned reaction settings with `saveToLibrary: false`.
- **`createdAt`** / **`updatedAt`** (`number`): Timestamps.

---

## 3. Storage Allocation & Quota Limits

| Storage Mechanism | Purpose | Technical Limit | Reactron Policy |
| :--- | :--- | :--- | :--- |
| **`chrome.storage.local`** | Structured records, schemas, entities, and settings | 5MB (Chrome default) / 10MB | **Restricted strictly to structured records.** No multi-megabyte base64 images allowed. |
| **IndexedDB (`reactron_media_db`)** | Uploaded animated GIFs, PNGs, and JPEGs | Up to 80% of available disk space | **Authoritative media repository.** Content-hashed deduplication and stable `mediaAssetId` references. |
| **In-Memory Store (`_memoryStore`)** | Non-extension preview & test harness | Heap space | Automated fallback when extension APIs or IndexedDB are inaccessible. |

---

## 4. Atomic Saving & Data Integrity Rules

1. **Atomic Reaction Configurations:**
   - Saving a Reaction Configuration persists the complete state of the configuration within its parent Watch Region and Game.
   - If only the GIF/Image Reaction is enabled, Reactron saves the GIF reaction and does **not** invent a dummy Text Reaction.
   - If only the Text Reaction is enabled, Reactron saves the Text reaction and does **not** invent a dummy GIF Reaction.
   - If both are enabled, both are saved under the shared configuration.
2. **Independent Library Presets:**
   - Checking "Save to Reaction Library" creates an independent `LibraryPreset` record.
   - Saving a Library Preset **never** creates or modifies unrelated games.
   - The checkbox remains disabled until a non-empty Reaction Name is provided.
3. **Pre-Commit Boundary Validation:**
   - Before any record is written to storage, `SchemaValidator` verifies entity contracts (required IDs, length limits, valid numbers).
   - In the event of a validation or storage write error, the operation throws or returns `{ success: false, error: message }` and does **not** falsely report success in the UI.

---

## 5. Schema Evolution & Migration Mechanism

`PersistenceService` provides a formal migration runner:
- Stored schema version is tracked under `reactron_schema_version`.
- On startup, `initialize()` compares the stored version against `SCHEMA_VERSION`.
- If older, registered migration functions in `MIGRATIONS` execute sequentially.
- Backward-compatible transformations upgrade legacy key formats into normalized relational collections.
- A built-in diagnostic test (`persistenceService.testSchemaMigration()`) verifies that older records migrate safely without data loss.

---

## 6. Orphaned Media Garbage Collection

When a user deletes a Game, Watch Region, or Reaction Configuration, binary media blobs in IndexedDB could become orphaned.
- `persistenceService.cleanupOrphanedMedia()` scans all active games, regions, and library presets.
- Any unreferenced `mediaAssetId` in `reactron_media_db` is safely pruned, preventing storage leaks over time.
