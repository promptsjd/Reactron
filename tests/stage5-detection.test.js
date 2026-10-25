import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { StrictnessMapper, STRICTNESS_BOUNDS } from '../extension/services/strictness-mapper.js';
import { TriggerDebouncer, DEBOUNCER_STATES } from '../extension/services/trigger-debouncer.js';
import { VisualDiffDetectionAdapter } from '../extension/services/detection-adapter.js';
import { DetectionService, MONITORING_STATUS } from '../extension/services/detection-service.js';
import { GameIdentityService } from '../extension/services/game-identity-service.js';

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
    const region1 = RegionManagementService.createWatchRegion();
    const config1 = region1.reactionConfigs[0];

    // Simulate a large (>2KB) uploaded GIF data URL
    const largeGifDataUrl = 'data:image/gif;base64,' + 'A'.repeat(6000) + 'TAIL_1';
    config1.gifReaction = {
      enabled: true,
      name: 'Nitro Boost',
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
      name: '',
      text: ''
    };
    draft.watchRegions = [region1];

    // 1. Save new game
    const saveRes1 = await gameMgmt.saveGame(draft);
    assert.equal(saveRes1.success, true);

    const savedGame1 = gameMgmt.getGameById(draft.id);
    assert.ok(savedGame1, 'Game should be retrievable by ID');
    assert.equal(savedGame1.watchRegions.length, 1);
    assert.equal(savedGame1.watchRegions[0].id, region1.id, 'Region ID preserved on save');
    assert.equal(savedGame1.watchRegions[0].reactionConfigs[0].id, config1.id, 'Config ID preserved on save');

    // Verify large dataUrl was offloaded to mediaStorage and omitted from chrome.storage.local payload
    const persistedGif = savedGame1.watchRegions[0].reactionConfigs[0].gifReaction;
    assert.ok(persistedGif.mediaAssetId, 'mediaAssetId should be assigned');
    assert.equal(persistedGif.fileUrl, '', 'Large dataUrl should be omitted from stored game record');
    const storedMedia = await mediaStorage.getMedia(persistedGif.mediaAssetId);
    assert.equal(storedMedia?.dataUrl, largeGifDataUrl, 'MediaStorage should hold full dataUrl');

    // 2. Save game a second time with saveToLibrary: true and updated summary/size -> verify preset deduplication
    savedGame1.watchRegions[0].reactionConfigs[0].gifReaction.size = 260;
    const saveRes2 = await gameMgmt.saveGame(savedGame1);
    assert.equal(saveRes2.success, true);

    const persistence = new PersistenceService();
    // Read from shared singleton via gameMgmt
    const gifPresets = (await persistence.getLibraryPresets('gif')).filter(
      (p) => p.name.toLowerCase() === 'nitro boost'
    );
    // Also verify on singleton persistenceService via deleteLibraryPreset
    const { persistenceService } = await import('../extension/services/persistence-service.js');
    const singletonPresets = (await persistenceService.getLibraryPresets('gif')).filter(
      (p) => p.name.toLowerCase() === 'nitro boost'
    );
    assert.equal(singletonPresets.length, 1, 'Saving multiple times with saveToLibrary: true must not duplicate presets');
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

