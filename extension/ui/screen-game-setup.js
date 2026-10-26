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
  createSlider,
  createEmptyState
} from './components.js';
import { createReactionEditor } from './screen-reaction-editor.js';
import { VALIDATION_LIMITS, validateGameName } from '../shared/validation.js';
import { RegionManagementService } from '../services/region-management-service.js';
import { STRICTNESS_LEVELS, StrictnessMapper } from '../services/strictness-mapper.js';

export function renderGameSetup({
  game,
  existingGames,
  onBackToDashboard,
  onSaveGame,
  onTriggerAreaSelection
}) {
  const container = document.createElement('div');
  container.className = 'r-screen r-screen-game-setup';

  // Navigation Header
  const navHeader = document.createElement('div');
  navHeader.className = 'r-nav-header';

  const backBtn = createButton({
    text: 'Back to Dashboard',
    variant: 'ghost',
    icon: '←',
    onClick: onBackToDashboard
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
  let autoSaveTimer = null;

  // Watch Region working copy (ensure 1 Watch Region exists so Select Area, Strictness, and Reaction Radio buttons appear immediately)
  let watchRegions =
    Array.isArray(game.watchRegions) && game.watchRegions.length > 0
      ? JSON.parse(JSON.stringify(game.watchRegions.slice(0, 1)))
      : [RegionManagementService.createWatchRegion(game.id)];

  const primaryRegion = watchRegions[0];
  primaryRegion.gameId = game.id;
  if (!Array.isArray(primaryRegion.reactionConfigs)) {
    primaryRegion.reactionConfigs = [];
  }

  // If no reactions exist yet, initialize the first draft slot so the radio buttons appear under the strictness slider
  if (primaryRegion.reactionConfigs.length === 0) {
    const firstDraft = RegionManagementService.createReactionConfiguration(1, primaryRegion.id, null);
    firstDraft._isUnsavedDraft = true;
    primaryRegion.reactionConfigs.push(firstDraft);
  }

  let expandedConfigId =
    primaryRegion.reactionConfigs.find((c) => c._isUnsavedDraft)?.id || null;

  /**
   * Validates Game Name and persists the current game + region + committed reactions to storage
   */
  async function persistGameConfiguration() {
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
    if (!isGamePersisted) return;
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

    watchRegions.forEach((region) => {
      const regionCard = document.createElement('div');
      regionCard.className = 'r-card r-region-card';

      // Select Area Button & Helper Text
      const selectAreaRow = document.createElement('div');
      selectAreaRow.className = 'r-select-area-group';

      const selectAreaBtn = createButton({
        text: region.previewUrl ? 'Reselect Area' : 'Select Area',
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
            region.previewUrl = null;
            region.geometry = null;
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
            <span>No area captured yet. Click Select Area above.</span>
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

      if (!Array.isArray(region.reactionConfigs)) {
        region.reactionConfigs = [];
      }

      // Ensure at least 1 draft slot exists if all reactions were removed
      if (region.reactionConfigs.length === 0) {
        const draftSlot = RegionManagementService.createReactionConfiguration(1, region.id, null);
        draftSlot._isUnsavedDraft = true;
        region.reactionConfigs.push(draftSlot);
        expandedConfigId = draftSlot.id;
      }

      const reactionConfigs = region.reactionConfigs;

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
            region.reactionConfigs = region.reactionConfigs.filter(
              (c) => c.id !== reactionConfig.id
            );
            if (expandedConfigId === reactionConfig.id) {
              expandedConfigId = null;
            }
            renderRegionsList();
            if (isGamePersisted) {
              await persistGameConfiguration();
            }
          };
          actionsDiv.appendChild(deleteTriggerBtn);

          rowHeader.appendChild(infoDiv);
          rowHeader.appendChild(actionsDiv);

          rowHeader.onclick = () => {
            expandedConfigId = isExpanded ? null : reactionConfig.id;
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

              expandedConfigId = null;
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
                  expandedConfigId = resetSlot.id;
                  renderRegionsList();
                  return;
                }
              }
              expandedConfigId = null;
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
            expandedConfigId = newConfig.id;
            renderRegionsList();
          }
        });
        reactionConfigsContainer.appendChild(addAnotherReactionBtn);
      }

      regionCard.appendChild(reactionConfigsContainer);
      regionsListContainer.appendChild(regionCard);
    });
  }

  function triggerSelectArea(region) {
    if (onTriggerAreaSelection) {
      onTriggerAreaSelection(region.id, async (capturedData) => {
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
    if (!captured || !captured.previewUrl) return;
    const target = watchRegions.find((r) => r.id === captured.regionId) || watchRegions[0];
    if (target) {
      target.previewUrl = captured.previewUrl;
      target.geometry = captured.geometry;
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        chrome.storage.local.remove(['reactron_last_captured_region']);
      }
      renderRegionsList();
      if (isGamePersisted) {
        await persistGameConfiguration();
      }
    }
  }

  // Check if pending region capture was already saved in storage
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
    chrome.storage.local.get(['reactron_last_captured_region'], (result) => {
      if (result.reactron_last_captured_region) {
        applyCapturedRegion(result.reactron_last_captured_region);
      }
    });

    // Real-time listener: updates preview immediately when selection completes while side panel is open
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'local' && changes.reactron_last_captured_region?.newValue) {
        applyCapturedRegion(changes.reactron_last_captured_region.newValue);
      }
    });
  }

  // Real-time message listener for instant capture response
  if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener((message) => {
      if (message.action === 'REGION_CAPTURED') {
        applyCapturedRegion(message);
      }
    });
  }

  renderRegionsList();
  regionsSection.appendChild(regionsListContainer);
  bodyScroll.appendChild(regionsSection);
  container.appendChild(bodyScroll);

  return container;
}

