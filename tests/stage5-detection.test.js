import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { StrictnessMapper, STRICTNESS_BOUNDS } from '../extension/services/strictness-mapper.js';
import { TriggerDebouncer, DEBOUNCER_STATES } from '../extension/services/trigger-debouncer.js';
import { VisualDiffDetectionAdapter } from '../extension/services/detection-adapter.js';
import { DetectionService, MONITORING_STATUS } from '../extension/services/detection-service.js';
import { GameIdentityService } from '../extension/services/game-identity-service.js';
import { ViewportLayoutService } from '../extension/services/viewport-layout-service.js';

import { PersistenceService } from '../extension/services/persistence-service.js';
import { GameManagementService } from '../extension/services/game-management-service.js';
import { RegionManagementService } from '../extension/services/region-management-service.js';
import { mediaStorage } from '../extension/services/media-storage.js';
import { STORAGE_KEYS } from '../extension/shared/schema.js';

describe('Stage 5: StrictnessMapper (Visual Fingerprinting Sensitivity)', () => {
  test('clamps values outside bounds to [1, 100]', () => {
    assert.equal(StrictnessMapper.clamp(0), STRICTNESS_BOUNDS.MIN_SLIDER);
    assert.equal(StrictnessMapper.clamp(-50), STRICTNESS_BOUNDS.MIN_SLIDER);
    assert.equal(StrictnessMapper.clamp(150), STRICTNESS_BOUNDS.MAX_SLIDER);
    assert.equal(StrictnessMapper.clamp(null), STRICTNESS_BOUNDS.DEFAULT_SLIDER);
    assert.equal(StrictnessMapper.clamp(undefined), STRICTNESS_BOUNDS.DEFAULT_SLIDER);
    assert.equal(StrictnessMapper.clamp(NaN), STRICTNESS_BOUNDS.DEFAULT_SLIDER);
  });

  test('higher strictness monotonically requires higher match similarity threshold', () => {
    const sMin = StrictnessMapper.mapToChangeDeltaThreshold(1);
    const sMid = StrictnessMapper.mapToChangeDeltaThreshold(50);
    const sDefault = StrictnessMapper.mapToChangeDeltaThreshold(75);
    const sMax = StrictnessMapper.mapToChangeDeltaThreshold(100);

    assert.equal(sMin, STRICTNESS_BOUNDS.MATCH_MIN_THRESHOLD_PERCENT);
    assert.equal(sMax, STRICTNESS_BOUNDS.MATCH_MAX_THRESHOLD_PERCENT);
    assert.ok(sMid > sMin, 'Mid strictness must require higher similarity than min');
    assert.ok(sDefault > sMid, 'Default strictness must require higher similarity than mid');
    assert.ok(sMax > sDefault, 'Max strictness must require higher similarity than default');
  });

  test('describes strictness levels with informative user explanations', () => {
    const descLow = StrictnessMapper.describeStrictness(20);
    const descMid = StrictnessMapper.describeStrictness(60);
    const descHigh = StrictnessMapper.describeStrictness(90);

    assert.equal(descLow.label, 'Low Strictness');
    assert.equal(descMid.label, 'Balanced Strictness');
    assert.equal(descHigh.label, 'High Strictness');
    assert.ok(descHigh.explanation.includes('precise match'));
  });
});

describe('Stage 5: FingerprintDetectionAdapter (Visual Fingerprinting)', () => {
  const adapter = new VisualDiffDetectionAdapter();

  test('identical pixel buffers yield 100% similarity and trigger successfully', () => {
    const frameA = new Uint8ClampedArray(400); // 10x10 black
    const frameB = new Uint8ClampedArray(400);

    const result = adapter.compare(frameA, frameB, { threshold: 75.0 });
    assert.equal(result.delta, 100.0);
    assert.equal(result.hasTriggered, true);
  });

  test('handles empty or corrupted buffers gracefully', () => {
    const result = adapter.compare(new Uint8ClampedArray(0), new Uint8ClampedArray(0));
    assert.equal(result.hasTriggered, false);
    assert.equal(result.delta, 0.0);
  });

  test('calculates correct similarity percentage when visual fingerprint changes', () => {
    const baseline = new Uint8ClampedArray(400); // black
    const current = new Uint8ClampedArray(400);
    // Fill half with white
    for (let i = 0; i < 200; i += 4) {
      current[i] = 255;
      current[i + 1] = 255;
      current[i + 2] = 255;
      current[i + 3] = 255;
    }

    const result = adapter.compare(current, baseline, { threshold: 75.0 });
    assert.ok(result.delta < 100.0, 'Partial change should reduce similarity percentage');
    assert.ok(result.details.gridSize, 'Should include grid details');
  });

  test('correctly fingerprints rectangular ImageData crops using width and height stride', () => {
    const width = 48;
    const height = 12;
    const totalBytes = width * height * 4;
    const baseBuffer = new Uint8ClampedArray(totalBytes);
    const currBuffer = new Uint8ClampedArray(totalBytes);

    // Paint right half of rectangular image bright red in baseline, left half in current
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * 4;
        if (x >= width / 2) {
          baseBuffer[idx] = 255;
        } else {
          currBuffer[idx] = 255;
        }
      }
    }

    const baseImageData = { data: baseBuffer, width, height };
    const currImageData = { data: currBuffer, width, height };

    const sameMatch = adapter.compare(baseImageData, baseImageData, { threshold: 80.0 });
    assert.equal(sameMatch.delta, 100.0);
    assert.equal(sameMatch.hasTriggered, true);

    const diffMatch = adapter.compare(currImageData, baseImageData, { threshold: 80.0 });
    assert.ok(diffMatch.delta < 80.0, 'Opposite horizontal halves in rectangular crop must not match');
    assert.equal(diffMatch.hasTriggered, false);
  });
});

describe('Stage 5: TriggerDebouncer & Cooldown Manager', () => {
  test('single event triggers once and transitions to TRIGGERED state', () => {
    const debouncer = new TriggerDebouncer({ cooldownMs: 3000 });
    const t0 = 1000;

    const res1 = debouncer.evaluate(60.0, 75.0, t0);
    assert.equal(res1.shouldTrigger, false);
    assert.equal(res1.state, DEBOUNCER_STATES.IDLE);

    const res2 = debouncer.evaluate(85.0, 75.0, t0 + 100);
    assert.equal(res2.shouldTrigger, true);
    assert.equal(res2.state, DEBOUNCER_STATES.TRIGGERED);
    assert.equal(debouncer.triggerCount, 1);
  });
});

describe('Stage 5: Browser Integration & Failure Handling', () => {
  test('identifies unsupported internal browser pages accurately', () => {
    const chromeInternal = GameIdentityService.validateTabEligibility('chrome://settings');
    const validHttp = GameIdentityService.validateTabEligibility('https://poki.com/en/g/astro-blaster');

    assert.equal(chromeInternal.isEligible, false);
    assert.equal(validHttp.isEligible, true);
  });

  test('DetectionService reports correct statuses for disabled and idle games', async () => {
    const service = new DetectionService();

    const games = [
      {
        id: 'game_disabled',
        name: 'Disabled Game',
        url: 'https://poki.com/game1',
        isEnabled: false,
        watchRegions: []
      }
    ];

    await service.syncWithGames(games);
    const statusDisabled = service.getGameStatus('game_disabled');
    assert.equal(statusDisabled.status, MONITORING_STATUS.DISABLED);
  });
});

describe('Phase 6: PersistenceService, GameManagementService & DetectionService Integration', () => {
  test('STORAGE_KEYS excludes unused REGIONS and CONFIGS keys', () => {
    assert.equal(STORAGE_KEYS.REGIONS, undefined);
    assert.equal(STORAGE_KEYS.CONFIGS, undefined);
    assert.ok(STORAGE_KEYS.GAMES);
    assert.ok(STORAGE_KEYS.LIBRARY_PRESETS);
  });

  test('CRUD persistence, ID preservation on edit, preset deduplication, and orphaned media cleanup', async () => {
    const gameMgmt = new GameManagementService();
    await gameMgmt.initialize();

    const draft = gameMgmt.createDraftGame('https://poki.com/en/g/cyber-racer', 'Cyber Racer');
    const region1 = RegionManagementService.createWatchRegion(draft.id);
    const config1 = RegionManagementService.createReactionConfiguration(1, region1.id, 'gif');

    // Verify dynamic naming rule ("Reaction 1", "Reaction 2") and no legacy Victory Explode/Text mocks
    assert.equal(RegionManagementService.formatConfigurationLabel(config1, 0), 'Reaction 1');
    assert.equal(RegionManagementService.formatConfigurationLabel(config1, 1), 'Reaction 2');
    assert.notEqual(config1.gifReaction.name, 'Victory Explode');
    assert.notEqual(config1.textReaction.name, 'Victory Text');

    // Simulate a large (>2KB) uploaded GIF data URL
    const largeGifDataUrl = 'data:image/gif;base64,' + 'A'.repeat(6000) + 'TAIL_1';
    config1.gifReaction = {
      enabled: true,
      name: 'Reaction 1',
      fileUrl: largeGifDataUrl,
      fileName: 'nitro.gif',
      size: 200,
      delaySeconds: 0.5,
      durationSeconds: 3,
      saveToLibrary: true,
      position: { xRatio: 0.5, yRatio: 0.35 }
    };
    config1.textReaction = {
      enabled: false,
      name: 'Reaction 1',
      text: ''
    };
    region1.reactionConfigs = [config1];
    draft.watchRegions = [region1];

    // 1. Save new game
    const saveRes1 = await gameMgmt.saveGame(draft);
    assert.equal(saveRes1.success, true);

    const savedGame1 = gameMgmt.getGameById(draft.id);
    assert.ok(savedGame1, 'Game should be retrievable by ID');
    assert.equal(savedGame1.watchRegions.length, 1);
    assert.equal(savedGame1.watchRegions[0].id, region1.id, 'Region ID preserved on save');
    assert.equal(savedGame1.watchRegions[0].reactionConfigs[0].id, config1.id, 'Config ID preserved on save');
    assert.equal(savedGame1.watchRegions[0].reactionConfigs[0].regionId, region1.id, 'Parent regionId preserved on save');

    // Verify large dataUrl was offloaded to mediaStorage and omitted from chrome.storage.local payload
    const persistedGif = savedGame1.watchRegions[0].reactionConfigs[0].gifReaction;
    assert.ok(persistedGif.mediaAssetId, 'mediaAssetId should be assigned');
    assert.equal(persistedGif.fileUrl, '', 'Large dataUrl should be omitted from stored game record');
    const storedMedia = await mediaStorage.getMedia(persistedGif.mediaAssetId);
    assert.equal(storedMedia?.dataUrl, largeGifDataUrl, 'MediaStorage should hold full dataUrl');

    // 2. Save game a second time with saveToLibrary: true and updated summary/size -> verify preset updates by unique ID
    savedGame1.watchRegions[0].reactionConfigs[0].gifReaction.size = 260;
    const saveRes2 = await gameMgmt.saveGame(savedGame1);
    assert.equal(saveRes2.success, true);

    const { persistenceService } = await import('../extension/services/persistence-service.js');
    const singletonPresets = (await persistenceService.getLibraryPresets('gif')).filter(
      (p) => p.id === persistedGif.libraryPresetId
    );
    assert.equal(singletonPresets.length, 1, 'Saving multiple times with same reaction ID updates its preset in place');
    assert.equal(singletonPresets[0].content.size, 260, 'Existing preset should be updated in place');

    // 3. Delete preset and delete region -> verify orphaned media is pruned from mediaStorage
    await persistenceService.deleteLibraryPreset(singletonPresets[0].id);
    savedGame1.watchRegions = [];
    await gameMgmt.saveGame(savedGame1);

    const prunedMedia = await mediaStorage.getMedia(persistedGif.mediaAssetId);
    assert.equal(prunedMedia, null, 'Orphaned media should be pruned after region and preset deletion');

    // Cleanup test game
    await gameMgmt.deleteGame(draft.id);
  });

  test('DetectionService.syncWithGames invalidates _baselineCache and reconciles regionDebouncers', async () => {
    const service = new DetectionService();
    const gameId = 'game_sync_test';
    const regionA = {
      id: 'reg_a',
      name: '',
      strictness: 75,
      geometry: { x: 0.1, y: 0.1, width: 0.2, height: 0.2 },
      previewUrl: 'data:image/png;base64,OLD_BASELINE',
      reactionConfigs: []
    };

    const game = {
      id: gameId,
      name: 'Sync Test',
      url: 'https://poki.com/en/g/sync-test',
      isEnabled: true,
      watchRegions: [regionA]
    };

    await service.syncWithGames([game]);
    await service.startSession(gameId, 101, 1);

    // Seed baseline cache manually to simulate decoded baseline
    service._baselineCache.set('reg_a', { data: new Uint8ClampedArray(16), width: 2, height: 2 });
    assert.equal(service._baselineCache.has('reg_a'), true);

    const session = service._sessions.get(`${gameId}:101`);
    assert.equal(session.regionDebouncers.has('reg_a'), true);

    // Reselect regionA and add regionB, then syncWithGames
    const regionB = {
      id: 'reg_b',
      name: '',
      strictness: 80,
      geometry: { x: 0.5, y: 0.5, width: 0.2, height: 0.2 },
      previewUrl: 'data:image/png;base64,NEW_BASELINE_B',
      reactionConfigs: []
    };
    const updatedGame = {
      ...game,
      watchRegions: [regionB]
    };

    await service.syncWithGames([updatedGame]);

    assert.equal(service._baselineCache.has('reg_a'), false, '_baselineCache must be cleared on syncWithGames');
    assert.equal(session.regionDebouncers.has('reg_a'), false, 'Removed region debouncer must be pruned');
    assert.equal(session.regionDebouncers.has('reg_b'), true, 'Added region debouncer must be registered');

    await service.stopSession(`${gameId}:101`);
  });

  test('DetectionService notifies status listeners when runtime triggers fire and pauses capture on inactive tabs', async () => {
    const service = new DetectionService();
    const gameId = 'game_trigger_notify';
    const region = {
      id: 'reg_trigger_1',
      name: 'Boss HP',
      strictness: 50,
      geometry: { x: 0, y: 0, width: 1, height: 1 },
      previewUrl: 'data:image/png;base64,FAKE',
      reactionConfigs: [
        {
          id: 'cfg_1',
          gifReaction: { enabled: false },
          textReaction: { enabled: true, name: 'KO', text: 'KO!' }
        }
      ]
    };

    const game = {
      id: gameId,
      name: 'Trigger Game',
      url: 'https://poki.com/en/g/trigger-game',
      isEnabled: true,
      watchRegions: [region]
    };

    await service.syncWithGames([game]);
    await service.startSession(gameId, 202, 1);
    const session = service._sessions.get(`${gameId}:202`);
    clearInterval(session.intervalId); // Control sampling manually in test

    const identicalPixels = { data: new Uint8ClampedArray(400), width: 10, height: 10 };
    service._baselineCache.set(region.id, identicalPixels);
    service._cropImageToPixels = async () => identicalPixels;

    let captureCalls = 0;
    service._captureTabViewport = async () => {
      captureCalls++;
      return { success: true, dataUrl: 'data:image/png;base64,CAPTURED' };
    };

    const notifiedCounts = [];
    service.onStatusChange((statusMap) => {
      const st = statusMap.get(gameId);
      if (st) notifiedCounts.push(st.triggerCount);
    });

    // 1. Tab is inactive -> should pause capture and not call _captureTabViewport
    service._getTab = async () => ({
      id: 202,
      windowId: 1,
      active: false,
      url: 'https://poki.com/en/g/trigger-game'
    });
    await service._sampleTabSession(session);
    assert.equal(captureCalls, 0, 'Should not capture viewport when tab is not active');

    // 2. Tab is active -> should capture, fire trigger, and notify status listeners with updated triggerCount
    service._getTab = async () => ({
      id: 202,
      windowId: 1,
      active: true,
      url: 'https://poki.com/en/g/trigger-game'
    });
    await service._sampleTabSession(session);
    assert.equal(captureCalls, 1, 'Should capture viewport when tab is active');
    assert.equal(session.triggerCount, 1, 'Session triggerCount should increment');
    assert.ok(notifiedCounts.includes(1), 'Status listener must be notified with triggerCount = 1');

    await service.stopSession(`${gameId}:202`);
  });
});

describe('Phase 7: ViewportLayoutService (Modular Browser Resize Adaptation)', () => {
  test('normalizes Watch Region relative to game surface and projects accurately when browser is resized', () => {
    // 1. Capture region while maximized (1920x1080) with a game canvas at (160, 40, 1600x900)
    const maximizedSurface = {
      left: 160,
      top: 40,
      width: 1600,
      height: 900,
      viewportWidth: 1920,
      viewportHeight: 1080,
      hasDedicatedSurface: true
    };

    // User selects a region at center of the game canvas: (x: 560, y: 265, w: 800, h: 450)
    const normalized = ViewportLayoutService.normalizeRegionToSurface(
      { x: 560, y: 265, width: 800, height: 450 },
      maximizedSurface
    );

    assert.equal(normalized.surfaceX, 0.25);
    assert.equal(normalized.surfaceY, 0.25);
    assert.equal(normalized.surfaceWidth, 0.5);
    assert.equal(normalized.surfaceHeight, 0.5);
    assert.equal(normalized.surfaceRefWidth, 1600);
    assert.equal(normalized.surfaceRefHeight, 900);

    // 2. User resizes browser to smaller window (1000x800) where game canvas moves to (100, 175, 800x450)
    const resizedSurface = {
      left: 100,
      top: 175,
      width: 800,
      height: 450,
      viewportWidth: 1000,
      viewportHeight: 800,
      hasDedicatedSurface: true
    };

    const primaryCrop = ViewportLayoutService.projectRegionToScreenshot(
      normalized,
      resizedSurface,
      1000,
      800
    );

    // Expected crop inside resized canvas: left = 100 + 0.25*800 = 300, top = 175 + 0.25*450 = 288, w = 400, h = 225
    assert.equal(primaryCrop.cropX, 300);
    assert.equal(primaryCrop.cropY, 288);
    assert.equal(primaryCrop.cropW, 400);
    assert.equal(primaryCrop.cropH, 225);
    assert.equal(primaryCrop.mode, 'surface');
  });

  test('projects aspect-ratio-contained crop when full-window canvas letterboxes on window resize', () => {
    // Captured maximized at 1920x1080 (16:9)
    const geom = {
      x: 0.5,
      y: 0.5,
      width: 0.2,
      height: 0.2,
      viewportWidth: 1920,
      viewportHeight: 1080
    };

    // Resized to a tall/narrow split window: 960x1080 (16:9 stage letterboxes to 960x540 at top=270)
    const candidates = ViewportLayoutService.getCandidateProjections(geom, null, 960, 1080);
    const aspectCandidate = candidates.find((c) => c.mode === 'aspect-contain');
    const viewportCandidate = candidates.find((c) => c.mode === 'viewport');

    assert.ok(aspectCandidate, 'Should produce aspect-contain candidate when aspect ratio changes');
    assert.ok(viewportCandidate, 'Should also retain direct viewport candidate');
    assert.equal(aspectCandidate.cropX, 480);
    assert.equal(aspectCandidate.cropY, 540); // 270 + 0.5 * 540
    assert.equal(aspectCandidate.cropW, 192); // 0.2 * 960
    assert.equal(aspectCandidate.cropH, 108); // 0.2 * 540
  });

  test('scales GIF size and Text fontSize proportionally and adjusts reaction x/y on browser resize', () => {
    const maximizedSurface = {
      left: 0,
      top: 0,
      width: 1920,
      height: 1080,
      viewportWidth: 1920,
      viewportHeight: 1080,
      hasDedicatedSurface: true
    };

    // Position reaction at (960, 378) -> xRatio: 0.5, yRatio: 0.35 while maximized
    const savedPos = ViewportLayoutService.normalizePositionToSurface(960, 378, maximizedSurface);
    assert.equal(savedPos.xRatio, 0.5);
    assert.equal(savedPos.yRatio, 0.35);
    assert.equal(savedPos.referenceWidth, 1920);
    assert.equal(savedPos.referenceHeight, 1080);

    // Resize browser to half-size window (960x540)
    const halfSurface = {
      left: 0,
      top: 0,
      width: 960,
      height: 540,
      viewportWidth: 960,
      viewportHeight: 540,
      hasDedicatedSurface: true
    };

    const scale = ViewportLayoutService.computeScaleFactor(savedPos, halfSurface);
    assert.equal(scale, 0.5, 'Scale factor should be 0.5 when window is resized to half dimensions');

    // Resize browser to letterboxed container (canvas at left: 100, top: 200, width: 960, height: 540 inside 1160x940 window)
    const offsetSurface = {
      left: 100,
      top: 200,
      width: 960,
      height: 540,
      viewportWidth: 1160,
      viewportHeight: 940,
      hasDedicatedSurface: true
    };

    const projectedPos = ViewportLayoutService.projectPositionToViewport(savedPos, offsetSurface);
    // Expected pixel X = 100 + 0.5 * 960 = 580 -> 580 / 1160 = 0.5
    // Expected pixel Y = 200 + 0.35 * 540 = 389 -> 389 / 940 = 0.4138
    assert.equal(projectedPos.xRatio, 0.5);
    assert.equal(projectedPos.yRatio, 0.4138);
  });

  test('supports multi-area setup (Select Area 1 & Select Area 2) with independent persistence and reactions', async () => {
    const gameMgmt = new GameManagementService();
    await gameMgmt.initialize();

    const draft = gameMgmt.createDraftGame('https://poki.com/en/g/arena-duel', 'Arena Duel');
    const area1 = RegionManagementService.createWatchRegion(draft.id);

    // 1. Dynamic naming without hardcoding
    assert.equal(RegionManagementService.formatRegionSelectLabel(area1, 0), 'Select Area 1');
    assert.equal(RegionManagementService.canAddRegion([area1]), false, 'Cannot add Area 2 before Area 1 is configured');

    // 2. Capture Area 1, still no saved reaction -> cannot add Area 2 yet
    area1.previewUrl = 'data:image/png;base64,AREA1_PREVIEW';
    area1.geometry = { x: 0.1, y: 0.1, width: 0.2, height: 0.1, viewportWidth: 1280, viewportHeight: 720 };
    assert.equal(RegionManagementService.formatRegionSelectLabel(area1, 0), 'Reselect Area 1');
    assert.equal(RegionManagementService.canAddRegion([area1]), false, 'Cannot add Area 2 until Area 1 has a saved reaction');

    // 3. Add unsaved draft reaction to Area 1 -> still cannot add Area 2
    const draftReaction1 = RegionManagementService.createReactionConfiguration(1, area1.id, 'text');
    draftReaction1._isUnsavedDraft = true;
    area1.reactionConfigs = [draftReaction1];
    assert.equal(RegionManagementService.canAddRegion([area1]), false);

    // 4. Commit/save Reaction 1 on Area 1 ("YOU WON!") -> now Area 2 can be added
    delete draftReaction1._isUnsavedDraft;
    draftReaction1.textReaction.enabled = true;
    draftReaction1.textReaction.text = 'YOU WON!';
    assert.equal(RegionManagementService.isRegionConfigured(area1), true);
    assert.equal(RegionManagementService.canAddRegion([area1]), true);

    // 5. Add Area 2 and configure it ("YOU LOST!")
    const area2 = RegionManagementService.createWatchRegion(draft.id);
    assert.equal(RegionManagementService.formatRegionSelectLabel(area2, 1), 'Select Area 2');
    assert.equal(RegionManagementService.canAddRegion([area1, area2]), false, 'Max 2 areas per game');

    area2.previewUrl = 'data:image/png;base64,AREA2_PREVIEW';
    area2.geometry = { x: 0.6, y: 0.8, width: 0.2, height: 0.1, viewportWidth: 1280, viewportHeight: 720 };
    assert.equal(RegionManagementService.formatRegionSelectLabel(area2, 1), 'Reselect Area 2');

    const reaction2 = RegionManagementService.createReactionConfiguration(1, area2.id, 'text');
    reaction2.textReaction.enabled = true;
    reaction2.textReaction.text = 'YOU LOST!';
    area2.reactionConfigs = [reaction2];

    draft.watchRegions = [area1, area2];
    const saveRes = await gameMgmt.saveGame(draft);
    assert.equal(saveRes.success, true);

    const saved = gameMgmt.getGameById(draft.id);
    assert.equal(saved.watchRegions.length, 2);
    assert.equal(saved.watchRegions[0].id, area1.id);
    assert.equal(saved.watchRegions[0].reactionConfigs[0].textReaction.text, 'YOU WON!');
    assert.equal(saved.watchRegions[1].id, area2.id);
    assert.equal(saved.watchRegions[1].reactionConfigs[0].textReaction.text, 'YOU LOST!');

    await gameMgmt.deleteGame(draft.id);
  });
});



