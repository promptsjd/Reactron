/**
 * Reactron Screen B: Game Setup Page
 * 
 * Requirements:
 * - Back to Dashboard control.
 * - Game URL in muted readable text.
 * - Game Name input with 15-char limit, live counter, and validation for empty/duplicate names.
 * - Watch Regions section:
 *   - Select Area button connected to real tab selection.
 *   - Helper text: "Select the part of the game Reactron should watch for a trigger."
 *   - Region preview frame displaying ONLY the selected region.
 *   - Small clear/remove control at top-right of frame.
 *   - Strictness slider with visible value and concise helper text.
 *   - Multiple Watch Regions support with stable internal IDs.
 *   - Normalized coordinates relative to content viewport.
 * - Saved Reaction Configuration entries as expandable rows.
 * - Label formatting policy:
 *   - Both names: "Name1 | Name2"
 *   - One name: "Name"
 *   - Neither name: Generated display label ("Reaction 1", "Reaction 2")
 *   - Keeps generated labels separate from user-entered names.
 * - Complete atomic Save & Cancel preserving omitted sections.
 * - "Add Another Region" button.
 */

import {
  createButton,
  createTextInput,
  createSlider
} from './components.js';
import { createReactionEditor } from './screen-reaction-editor.js';
import { VALIDATION_LIMITS, validateGameName } from '../shared/validation.js';
import { STORAGE_KEYS } from '../shared/schema.js';
import { WATCH_REGION_CONSTANTS } from '../shared/types.js';
import { RegionManagementService } from '../services/region-management-service.js';
import { STRICTNESS_LEVELS, StrictnessMapper } from '../services/strictness-mapper.js';
import { OverlayEngineService } from '../services/overlay-engine.js';
import { persistenceService } from '../services/persistence-service.js';

export function renderGameSetup({
  game,
  existingGames,
  onBackToDashboard,
  onSaveGame,
  onTriggerAreaSelection
}) {
  const container = document.createElement('div');
  container.className = 'r-screen r-screen-game-setup';

  let isDisposed = false;
  let autoSaveTimer = null;
  let storageChangeListener = null;
  let runtimeMessageListener = null;

  function cleanupListeners() {
    isDisposed = true;
    if (autoSaveTimer) {
      clearTimeout(autoSaveTimer);
      autoSaveTimer = null;
    }
    if (
      storageChangeListener &&
      typeof chrome !== 'undefined' &&
      chrome.storage &&
      chrome.storage.onChanged
    ) {
      chrome.storage.onChanged.removeListener(storageChangeListener);
      storageChangeListener = null;
    }
    if (
      runtimeMessageListener &&
      typeof chrome !== 'undefined' &&
      chrome.runtime &&
      chrome.runtime.onMessage
    ) {
      chrome.runtime.onMessage.removeListener(runtimeMessageListener);
      runtimeMessageListener = null;
    }
  }

  container.cleanup = cleanupListeners;

  // Navigation Header
  const navHeader = document.createElement('div');
  navHeader.className = 'r-nav-header';

  const backBtn = createButton({
    text: 'Back to Dashboard',
    variant: 'ghost',
    icon: '←',
    onClick: () => {
      cleanupListeners();
      if (onBackToDashboard) onBackToDashboard();
    }
  });

  const headerTitle = document.createElement('span');
  headerTitle.className = 'r-nav-title';
  headerTitle.textContent = 'Game Setup';

  navHeader.appendChild(backBtn);
  navHeader.appendChild(headerTitle);
  container.appendChild(navHeader);

  // Scrollable Body
  const bodyScroll = document.createElement('div');
  bodyScroll.className = 'r-setup-body';

  // Top Section: Game URL & Game Name
  const topCard = document.createElement('div');
  topCard.className = 'r-card r-top-card';

  // Game URL
  const urlBox = document.createElement('div');
  urlBox.className = 'r-url-box';
  urlBox.innerHTML = `
    <span class="r-url-label">Game Tab URL:</span>
    <span class="r-url-value" title="${game.url}">${game.url}</span>
  `;
  topCard.appendChild(urlBox);

  // Track whether this game has already been persisted to storage
  let isGamePersisted = Array.isArray(existingGames) && existingGames.some((g) => g.id === game.id);

  // Watch Regions working copy (supports up to MAX_REGIONS_PER_GAME, starting with 1 region for new games)
  let watchRegions =
    Array.isArray(game.watchRegions) && game.watchRegions.length > 0
      ? JSON.parse(
          JSON.stringify(game.watchRegions.slice(0, WATCH_REGION_CONSTANTS.MAX_REGIONS_PER_GAME))
        )
      : [RegionManagementService.createWatchRegion(game.id)];

  // Track expanded reaction configuration ID independently per Watch Region
  const expandedConfigByRegion = new Map();

  function ensureRegionInitialized(region) {
    region.gameId = game.id;
    if (!Array.isArray(region.reactionConfigs)) {
      region.reactionConfigs = [];
    }
    if (region.reactionConfigs.length === 0) {
      const firstDraft = RegionManagementService.createReactionConfiguration(1, region.id, null);
      firstDraft._isUnsavedDraft = true;
      region.reactionConfigs.push(firstDraft);
      expandedConfigByRegion.set(region.id, firstDraft.id);
    } else if (!expandedConfigByRegion.has(region.id)) {
      const openDraft = region.reactionConfigs.find((c) => c._isUnsavedDraft);
      expandedConfigByRegion.set(region.id, openDraft ? openDraft.id : null);
    }
  }

  watchRegions.forEach(ensureRegionInitialized);

  /**
   * Validates Game Name and persists the current game + regions + committed reactions to storage
   */
  async function persistGameConfiguration() {
    if (isDisposed) return { success: false, error: 'Screen disposed' };

    const valResult = validateGameName(currentGameName, existingGames, game.id);
    if (!valResult.isValid) {
      nameField.setError(valResult.error);
      bodyScroll.scrollTo?.({ top: 0, behavior: 'smooth' });
      return { success: false, error: valResult.error };
    }

    nameField.setError(null);

    const cleanedRegions = watchRegions.map((reg) => ({
      ...reg,
      gameId: game.id,
      reactionConfigs: (reg.reactionConfigs || []).filter(
        (cfg) => !cfg._isUnsavedDraft && (cfg.type || cfg.gifReaction?.enabled || cfg.textReaction?.enabled)
      )
    }));

    if (onSaveGame) {
      const result = await onSaveGame({
        ...game,
        name: currentGameName.trim(),
        watchRegions: cleanedRegions
      });

      if (result && !result.success) {
        const errMsg = result.error || 'Failed to save game configuration.';
        nameField.setError(errMsg);
        return { success: false, error: errMsg };
      }

      isGamePersisted = true;
      return { success: true, game: result?.game };
    }

    isGamePersisted = true;
    return { success: true };
  }

  function scheduleAutoPersistIfSaved() {
    if (isDisposed || !isGamePersisted) return;
    if (autoSaveTimer) clearTimeout(autoSaveTimer);
    autoSaveTimer = setTimeout(() => {
      persistGameConfiguration();
    }, 300);
  }

  // Wire live Game Name validation + auto-persist when editing an already saved game
  let currentGameName = game.name || '';
  const nameField = createTextInput({
    label: 'Game Name',
    value: currentGameName,
    placeholder: 'e.g. Space Blaster',
    maxLength: VALIDATION_LIMITS.GAME_NAME_MAX_LENGTH,
    onChange: (val) => {
      currentGameName = val;
      const result = validateGameName(val, existingGames, game.id);
      nameField.setError(result.error);
      if (result.isValid) {
        scheduleAutoPersistIfSaved();
      }
    }
  });

  if (!currentGameName.trim()) {
    nameField.setError('Game Name is required');
  }

  topCard.appendChild(nameField);
  bodyScroll.appendChild(topCard);

  // Watch Regions Section
  const regionsSection = document.createElement('div');
  regionsSection.className = 'r-section';

  const regionsListContainer = document.createElement('div');
  regionsListContainer.className = 'r-regions-list';

  function renderRegionsList() {
    regionsListContainer.innerHTML = '';

    watchRegions.forEach((region, regionIndex) => {
      ensureRegionInitialized(region);

      const regionCard = document.createElement('div');
      regionCard.className = 'r-card r-region-card';

      // Select Area Button & Helper Text
      const selectAreaRow = document.createElement('div');
      selectAreaRow.className = 'r-select-area-group';

      const selectAreaBtn = createButton({
        text: RegionManagementService.formatRegionSelectLabel(region, regionIndex),
        variant: 'secondary',
        onClick: () => {
          triggerSelectArea(region);
        }
      });

      const helperText = document.createElement('p');
      helperText.className = 'r-helper-text';
      helperText.textContent = 'Select the part of the game Reactron should watch for a trigger.';

      selectAreaRow.appendChild(selectAreaBtn);
      selectAreaRow.appendChild(helperText);
      regionCard.appendChild(selectAreaRow);

      // Region Preview Frame (must display ONLY the selected region)
      const previewFrame = document.createElement('div');
      previewFrame.className = 'r-preview-frame';

      if (region.previewUrl) {
        previewFrame.innerHTML = `
          <img src="${region.previewUrl}" alt="Selected Region Preview" class="r-preview-img" />
          <span class="r-preview-badge">Watch Region Active</span>
          <button class="r-preview-clear-btn" title="Clear Region Preview">✕</button>
        `;
        const clearBtn = previewFrame.querySelector('.r-preview-clear-btn');
        if (clearBtn) {
          clearBtn.onclick = async (e) => {
            e.stopPropagation();
            RegionManagementService.clearRegionArea(region);
            await persistenceService.clearCapturedRegionCache();
            await OverlayEngineService.clearOverlays(null);
            renderRegionsList();
            if (isGamePersisted) {
              await persistGameConfiguration();
            }
          };
        }
      } else {
        previewFrame.innerHTML = `
          <div class="r-preview-placeholder">
            <span>📷</span>
            <span>No area captured yet. Click ${RegionManagementService.formatRegionSelectLabel(region, regionIndex)} above.</span>
          </div>
        `;
      }
      regionCard.appendChild(previewFrame);

      const isAreaSelected = Boolean(region.previewUrl && region.geometry);

      // Smart 4-step Strictness Slider (Loose / Balanced / Strict / Exact) - disabled until an area is selected
      const resolvedStep = StrictnessMapper.resolveSmartStep(region.strictness || 75);
      region.strictness = resolvedStep.value;

      const strictnessSlider = createSlider({
        label: 'Strictness',
        value: region.strictness,
        steps: STRICTNESS_LEVELS,
        disabled: !isAreaSelected,
        helperText: resolvedStep.helperText,
        onChange: (val) => {
          region.strictness = val;
          scheduleAutoPersistIfSaved();
        }
      });
      regionCard.appendChild(strictnessSlider);

      // Reaction Configurations Section (directly under Strictness slider, up to 2 reactions one by one)
      const reactionConfigsContainer = document.createElement('div');
      reactionConfigsContainer.className = 'r-reactions-section';

      const reactionConfigs = region.reactionConfigs;
      const expandedConfigId = expandedConfigByRegion.get(region.id) || null;

      reactionConfigs.forEach((reactionConfig, configIndex) => {
        reactionConfig.regionId = region.id;
        const isExpanded = expandedConfigId === reactionConfig.id;
        const isUnsavedDraft = Boolean(reactionConfig._isUnsavedDraft);
        const displayLabel = RegionManagementService.formatConfigurationLabel(
          reactionConfig,
          configIndex
        );

        const row = document.createElement('div');
        row.className = `r-reaction-row ${isUnsavedDraft && isExpanded ? 'r-reaction-row-draft' : ''}`.trim();

        // Collapsed Summary Header (shown when reaction is saved/collapsed, or as header when editing a saved reaction)
        if (!isUnsavedDraft || !isExpanded) {
          const rowHeader = document.createElement('div');
          rowHeader.className = `r-reaction-row-header ${isExpanded ? 'expanded' : ''}`;

          const infoDiv = document.createElement('div');
          infoDiv.className = 'r-reaction-row-info';
          infoDiv.innerHTML = `
            <span class="r-chevron">${isExpanded ? '▼' : '▶'}</span>
            <span class="r-reaction-row-title">${displayLabel}</span>
          `;

          const actionsDiv = document.createElement('div');
          actionsDiv.className = 'r-reaction-row-actions';
          actionsDiv.style.display = 'flex';
          actionsDiv.style.alignItems = 'center';
          actionsDiv.style.gap = '6px';

          const deleteTriggerBtn = document.createElement('button');
          deleteTriggerBtn.className = 'r-btn-icon-remove';
          deleteTriggerBtn.title = `Remove ${displayLabel}`;
          deleteTriggerBtn.innerHTML = '✕';
          deleteTriggerBtn.onclick = async (e) => {
            e.stopPropagation();
            RegionManagementService.removeReactionConfiguration(region, reactionConfig.id);
            if (expandedConfigByRegion.get(region.id) === reactionConfig.id) {
              expandedConfigByRegion.set(region.id, null);
            }
            await OverlayEngineService.clearOverlays(null);
            renderRegionsList();
            if (isGamePersisted) {
              await persistGameConfiguration();
            }
          };
          actionsDiv.appendChild(deleteTriggerBtn);

          rowHeader.appendChild(infoDiv);
          rowHeader.appendChild(actionsDiv);

          rowHeader.onclick = () => {
            expandedConfigByRegion.set(region.id, isExpanded ? null : reactionConfig.id);
            renderRegionsList();
          };

          row.appendChild(rowHeader);
        }

        // Expandable Content Body (Screen C: Reaction Configuration Editor)
        if (isExpanded) {
          const rowContent = document.createElement('div');
          rowContent.className = 'r-reaction-row-body';

          const editor = createReactionEditor({
            config: reactionConfig,
            configIndex,
            isAreaSelected,
            onSave: async (updatedConfig) => {
              const cleanConfig = {
                ...updatedConfig,
                id: reactionConfig.id,
                regionId: region.id
              };
              delete cleanConfig._isUnsavedDraft;

              const previousSnapshot = JSON.parse(JSON.stringify(region.reactionConfigs));
              const existingIdx = region.reactionConfigs.findIndex((c) => c.id === reactionConfig.id);
              if (existingIdx >= 0) {
                region.reactionConfigs[existingIdx] = cleanConfig;
              } else {
                delete reactionConfig._isUnsavedDraft;
                Object.assign(reactionConfig, cleanConfig);
              }

              // Immediately persist game + region + reaction to storage and sync background detection
              const persistRes = await persistGameConfiguration();
              if (!persistRes.success) {
                region.reactionConfigs = previousSnapshot;
                return persistRes;
              }

              expandedConfigByRegion.set(region.id, null);
              renderRegionsList();
              return { success: true };
            },
            onCancel: () => {
              if (reactionConfig._isUnsavedDraft) {
                if (region.reactionConfigs.length > 1) {
                  region.reactionConfigs = region.reactionConfigs.filter(
                    (c) => c.id !== reactionConfig.id
                  );
                } else {
                  const resetSlot = RegionManagementService.createReactionConfiguration(
                    1,
                    region.id,
                    null
                  );
                  resetSlot.id = reactionConfig.id;
                  resetSlot._isUnsavedDraft = true;
                  region.reactionConfigs[0] = resetSlot;
                  expandedConfigByRegion.set(region.id, resetSlot.id);
                  renderRegionsList();
                  return;
                }
              }
              expandedConfigByRegion.set(region.id, null);
              renderRegionsList();
            }
          });

          rowContent.appendChild(editor);
          row.appendChild(rowContent);
        }

        reactionConfigsContainer.appendChild(row);
      });

      // Show "Add Another Reaction" button underneath when saved reaction(s) are collapsed and count < 2
      const hasCommittedReaction = reactionConfigs.some((c) => !c._isUnsavedDraft);
      const hasOpenDraft = reactionConfigs.some((c) => c._isUnsavedDraft);
      if (
        hasCommittedReaction &&
        !hasOpenDraft &&
        RegionManagementService.canAddReaction(region)
      ) {
        const addAnotherReactionBtn = createButton({
          text: 'Add Another Reaction',
          variant: 'outline',
          icon: '➕',
          className: 'r-btn-full r-mt-sm',
          onClick: () => {
            const nextIndex = region.reactionConfigs.length + 1;
            const newConfig = RegionManagementService.createReactionConfiguration(
              nextIndex,
              region.id,
              null
            );
            newConfig._isUnsavedDraft = true;
            region.reactionConfigs.push(newConfig);
            expandedConfigByRegion.set(region.id, newConfig.id);
            renderRegionsList();
          }
        });
        reactionConfigsContainer.appendChild(addAnotherReactionBtn);
      }

      regionCard.appendChild(reactionConfigsContainer);
      regionsListContainer.appendChild(regionCard);
    });

    // Show "Add Another Area" button in a separate panel/control under Area 1 once Area 1 has an area selected and at least 1 saved reaction
    if (RegionManagementService.canAddRegion(watchRegions)) {
      const addAnotherAreaPanel = document.createElement('div');
      addAnotherAreaPanel.className = 'r-card r-add-area-panel';

      const addAnotherAreaBtn = createButton({
        text: WATCH_REGION_CONSTANTS.ADD_ANOTHER_LABEL,
        variant: 'outline',
        icon: '➕',
        className: 'r-btn-full',
        onClick: () => {
          const nextRegion = RegionManagementService.createWatchRegion(game.id);
          ensureRegionInitialized(nextRegion);
          watchRegions.push(nextRegion);
          renderRegionsList();
        }
      });

      addAnotherAreaPanel.appendChild(addAnotherAreaBtn);
      regionsListContainer.appendChild(addAnotherAreaPanel);
    }
  }

  function triggerSelectArea(region) {
    if (onTriggerAreaSelection) {
      onTriggerAreaSelection(region.id, async (capturedData) => {
        if (isDisposed) return;
        if (capturedData && capturedData.previewUrl) {
          region.previewUrl = capturedData.previewUrl;
          region.geometry = capturedData.geometry;
          renderRegionsList();
          if (isGamePersisted) {
            await persistGameConfiguration();
          }
        }
      });
    }
  }

  async function applyCapturedRegion(captured) {
    if (isDisposed || !captured || !captured.previewUrl) return;
    // Match strictly by regionId belonging to this game's active setup screen
    const target = captured.regionId
      ? watchRegions.find((r) => r.id === captured.regionId)
      : null;
    if (target) {
      target.previewUrl = captured.previewUrl;
      target.geometry = captured.geometry;
      await persistenceService.clearCapturedRegionCache();
      renderRegionsList();
      if (isGamePersisted) {
        await persistGameConfiguration();
      }
    }
  }

  // Check if pending region capture was already saved in storage
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
    chrome.storage.local.get([STORAGE_KEYS.LAST_CAPTURED_REGION], (result) => {
      if (result && result[STORAGE_KEYS.LAST_CAPTURED_REGION]) {
        applyCapturedRegion(result[STORAGE_KEYS.LAST_CAPTURED_REGION]);
      }
    });

    // Real-time listener: updates preview immediately when selection completes while side panel is open
    storageChangeListener = (changes, area) => {
      if (area === 'local' && changes[STORAGE_KEYS.LAST_CAPTURED_REGION]?.newValue) {
        applyCapturedRegion(changes[STORAGE_KEYS.LAST_CAPTURED_REGION].newValue);
      }
    };
    chrome.storage.onChanged.addListener(storageChangeListener);
  }

  // Real-time message listener for instant capture response
  if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
    runtimeMessageListener = (message) => {
      if (message && message.action === 'REGION_CAPTURED') {
        applyCapturedRegion(message);
      }
    };
    chrome.runtime.onMessage.addListener(runtimeMessageListener);
  }

  renderRegionsList();
  regionsSection.appendChild(regionsListContainer);
  bodyScroll.appendChild(regionsSection);
  container.appendChild(bodyScroll);

  return container;
}

