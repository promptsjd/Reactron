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

  // Game Name input with 15-char limit, counter, and validation
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

  const sectionHeader = document.createElement('div');
  sectionHeader.className = 'r-section-header';
  sectionHeader.innerHTML = `
    <h2 class="r-section-title">Watch Regions</h2>
    <span class="r-section-subtitle">Configured trigger zones</span>
  `;
  regionsSection.appendChild(sectionHeader);

  // Watch Region working copy
  let watchRegions = game.watchRegions ? JSON.parse(JSON.stringify(game.watchRegions)) : [];
  let expandedConfigId = watchRegions.length > 0 && watchRegions[0].reactionConfigs?.length > 0
    ? watchRegions[0].reactionConfigs[0].id
    : null;
  let activeReactionEditor = null;

  const regionsListContainer = document.createElement('div');
  regionsListContainer.className = 'r-regions-list';

  function renderRegionsList() {
    regionsListContainer.innerHTML = '';
    activeReactionEditor = null;

    if (watchRegions.length === 0) {
      // Empty state when no watch regions exist
      const emptyState = createEmptyState({
        title: 'No Watch Regions Added',
        description: 'Select an area where Reactron should look for on-screen events to trigger your reactions.',
        action: createButton({
          text: 'Select Area',
          variant: 'primary',
          onClick: () => {
            const newRegion = RegionManagementService.createWatchRegion(1);
            watchRegions.push(newRegion);
            expandedConfigId = newRegion.reactionConfigs[0].id;
            renderRegionsList();
            // Start interactive area selection
            triggerSelectArea(newRegion);
          }
        })
      });
      regionsListContainer.appendChild(emptyState);
      return;
    }

    watchRegions.forEach((region, regionIndex) => {
      const regionCard = document.createElement('div');
      regionCard.className = 'r-card r-region-card';

      // Region Title Row with Name & Clear/Remove control
      const regionTitleRow = document.createElement('div');
      regionTitleRow.className = 'r-region-header-row';

      const regionLabel = document.createElement('span');
      regionLabel.className = 'r-region-name';
      const customRegionName =
        region.name && !/^Watch Region \d+$/i.test(region.name.trim()) ? region.name.trim() : '';
      regionLabel.textContent = customRegionName || `Watch Region ${regionIndex + 1}`;

      // Small clear/remove control at top-right of region card
      const removeBtn = document.createElement('button');
      removeBtn.className = 'r-btn-icon-remove';
      removeBtn.title = 'Clear / Remove Watch Region';
      removeBtn.innerHTML = '✕';
      removeBtn.onclick = () => {
        watchRegions = watchRegions.filter((r) => r.id !== region.id);
        renderRegionsList();
      };

      regionTitleRow.appendChild(regionLabel);
      regionTitleRow.appendChild(removeBtn);
      regionCard.appendChild(regionTitleRow);

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
          clearBtn.onclick = (e) => {
            e.stopPropagation();
            region.previewUrl = null;
            region.geometry = null;
            renderRegionsList();
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

      // Strictness Slider with visible value and concise helper text
      const strictnessSlider = createSlider({
        label: 'Strictness',
        min: 1,
        max: 100,
        value: region.strictness || 75,
        unit: '%',
        helperText: 'Higher strictness requires larger visual change to trigger reaction.',
        onChange: (val) => {
          region.strictness = val;
        }
      });
      regionCard.appendChild(strictnessSlider);

      // Reaction Configurations Section (Multiple per region)
      const reactionConfigsContainer = document.createElement('div');
      reactionConfigsContainer.className = 'r-reactions-section';

      const reactionsHeaderRow = document.createElement('div');
      reactionsHeaderRow.className = 'r-reactions-header-row';

      const reactionsHeader = document.createElement('span');
      reactionsHeader.className = 'r-reactions-header';
      reactionsHeader.textContent = 'Reaction Configurations';

      const addReactionBtn = createButton({
        text: 'Add Reaction',
        variant: 'ghost',
        icon: '➕',
        className: 'r-btn-xs',
        onClick: () => {
          const newConfig = RegionManagementService.createReactionConfiguration(
            (region.reactionConfigs?.length || 0) + 1
          );
          newConfig._isUnsavedDraft = true;
          if (!region.reactionConfigs) region.reactionConfigs = [];
          region.reactionConfigs.push(newConfig);
          expandedConfigId = newConfig.id;
          renderRegionsList();
        }
      });

      reactionsHeaderRow.appendChild(reactionsHeader);
      reactionsHeaderRow.appendChild(addReactionBtn);
      reactionConfigsContainer.appendChild(reactionsHeaderRow);

      const reactionConfigs = region.reactionConfigs || [];
      reactionConfigs.forEach((reactionConfig, configIndex) => {
        const row = document.createElement('div');
        row.className = 'r-reaction-row';

        const isExpanded = expandedConfigId === reactionConfig.id;

        // Label formatting policy:
        // - Both names: "Name1 | Name2"
        // - One name: "Name"
        // - Neither: Generated display label ("Reaction 1")
        // - Keeps generated labels separate from user-entered names
        const displayLabel = RegionManagementService.formatConfigurationLabel(
          reactionConfig,
          configIndex
        );

        // Row Header (Locked Summary State with Edit & Delete Actions)
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

        const badgeEl = document.createElement('span');
        badgeEl.className = 'r-badge r-badge-accent';
        badgeEl.textContent = reactionConfig.gifReaction?.enabled && reactionConfig.textReaction?.enabled ? 'GIF + Text' : reactionConfig.gifReaction?.enabled ? 'GIF Only' : reactionConfig.textReaction?.enabled ? 'Text Only' : 'Inactive';
        actionsDiv.appendChild(badgeEl);

        const editBtn = createButton({
          text: isExpanded ? 'Close' : 'Edit',
          variant: 'outline',
          className: 'r-btn-xs',
          onClick: (e) => {
            e.stopPropagation();
            expandedConfigId = isExpanded ? null : reactionConfig.id;
            renderRegionsList();
          }
        });
        actionsDiv.appendChild(editBtn);

        if (reactionConfigs.length > 1) {
          const deleteTriggerBtn = document.createElement('button');
          deleteTriggerBtn.className = 'r-btn-icon-remove';
          deleteTriggerBtn.title = 'Remove Trigger Configuration';
          deleteTriggerBtn.innerHTML = '✕';
          deleteTriggerBtn.onclick = (e) => {
            e.stopPropagation();
            region.reactionConfigs = region.reactionConfigs.filter(
              (c) => c.id !== reactionConfig.id
            );
            if (expandedConfigId === reactionConfig.id) {
              expandedConfigId = null;
            }
            renderRegionsList();
          };
          actionsDiv.appendChild(deleteTriggerBtn);
        }

        rowHeader.appendChild(infoDiv);
        rowHeader.appendChild(actionsDiv);

        rowHeader.onclick = () => {
          expandedConfigId = isExpanded ? null : reactionConfig.id;
          renderRegionsList();
        };

        row.appendChild(rowHeader);

        // Expandable Content Body (Screen C: Reaction Configuration Editor)
        if (isExpanded) {
          const rowContent = document.createElement('div');
          rowContent.className = 'r-reaction-row-body';

          const editor = createReactionEditor({
            config: reactionConfig,
            onSave: (updatedConfig) => {
              // Complete atomic save updating existing config in place by ID (Upsert)
              const cleanConfig = {
                ...updatedConfig,
                id: reactionConfig.id
              };
              delete cleanConfig._isUnsavedDraft;
              const existingIdx = region.reactionConfigs.findIndex((c) => c.id === reactionConfig.id);
              if (existingIdx >= 0) {
                region.reactionConfigs[existingIdx] = cleanConfig;
              } else {
                delete reactionConfig._isUnsavedDraft;
                Object.assign(reactionConfig, cleanConfig);
              }
              expandedConfigId = null;
              renderRegionsList();
            },
            onCancel: () => {
              // Discard unsaved edits; remove transient draft if uncommitted
              if (reactionConfig._isUnsavedDraft) {
                region.reactionConfigs = (region.reactionConfigs || []).filter(
                  (c) => c.id !== reactionConfig.id
                );
              }
              expandedConfigId = null;
              renderRegionsList();
            },
            onPreview: (type, data) => {
              alert(`[Preview] Triggering ${type} reaction overlay on active tab.`);
            }
          });

          activeReactionEditor = editor;
          rowContent.appendChild(editor);
          row.appendChild(rowContent);
        }

        reactionConfigsContainer.appendChild(row);
      });

      regionCard.appendChild(reactionConfigsContainer);
      regionsListContainer.appendChild(regionCard);
    });

    // "Show an Add Another Region button after the saved region entries, using the approved product terminology consistently."
    const addAnotherRegionBtn = createButton({
      text: 'Add Another Region',
      variant: 'outline',
      icon: '➕',
      className: 'r-btn-full r-mt-md',
      onClick: () => {
        const newRegion = RegionManagementService.createWatchRegion(watchRegions.length + 1);
        watchRegions.push(newRegion);
        expandedConfigId = newRegion.reactionConfigs[0].id;
        renderRegionsList();
        triggerSelectArea(newRegion);
      }
    });

    regionsListContainer.appendChild(addAnotherRegionBtn);
  }

  function triggerSelectArea(region) {
    if (onTriggerAreaSelection) {
      onTriggerAreaSelection(region.id, (capturedData) => {
        if (capturedData && capturedData.previewUrl) {
          region.previewUrl = capturedData.previewUrl;
          region.geometry = capturedData.geometry;
          renderRegionsList();
        }
      });
    }
  }

  function applyCapturedRegion(captured) {
    if (!captured || !captured.previewUrl) return;
    const target = watchRegions.find((r) => r.id === captured.regionId) || watchRegions[0];
    if (target) {
      target.previewUrl = captured.previewUrl;
      target.geometry = captured.geometry;
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        chrome.storage.local.remove(['reactron_last_captured_region']);
      }
      renderRegionsList();
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

  // Bottom Save & Complete Action
  const footer = document.createElement('div');
  footer.className = 'r-setup-footer';

  const saveErrorBanner = document.createElement('div');
  saveErrorBanner.className = 'r-save-error-banner';
  saveErrorBanner.style.display = 'none';
  saveErrorBanner.style.color = '#E9B765';
  saveErrorBanner.style.fontSize = '12px';
  saveErrorBanner.style.marginBottom = '8px';
  saveErrorBanner.style.padding = '8px 12px';
  saveErrorBanner.style.borderRadius = '6px';
  saveErrorBanner.style.backgroundColor = 'rgba(233, 183, 101, 0.1)';
  saveErrorBanner.style.border = '1px solid rgba(233, 183, 101, 0.3)';

  const saveBtn = createButton({
    text: 'Save Game Configuration',
    variant: 'primary',
    className: 'r-btn-full',
    onClick: async () => {
      saveErrorBanner.style.display = 'none';
      saveErrorBanner.textContent = '';

      // If a Reaction Editor is currently expanded, automatically flush/validate it first
      if (expandedConfigId && activeReactionEditor && typeof activeReactionEditor.flushAndSave === 'function') {
        const flushResult = await activeReactionEditor.flushAndSave();
        if (flushResult && !flushResult.isValid) {
          const errMsg = flushResult.error || 'Invalid reaction configuration.';
          saveErrorBanner.textContent = `⚠️ Save Failed: ${errMsg}`;
          saveErrorBanner.style.display = 'block';
          return;
        }
      }

      const valResult = validateGameName(currentGameName, existingGames, game.id);
      if (!valResult.isValid) {
        nameField.setError(valResult.error);
        return;
      }

      if (onSaveGame) {
        saveBtn.disabled = true;
        const result = await onSaveGame({
          ...game,
          name: currentGameName.trim(),
          watchRegions
        });
        saveBtn.disabled = false;

        if (result && !result.success) {
          const errMsg = result.error || 'Failed to save game configuration.';
          nameField.setError(errMsg);
          saveErrorBanner.textContent = `⚠️ Save Failed: ${errMsg}`;
          saveErrorBanner.style.display = 'block';
          return;
        }
      }

      onBackToDashboard();
    }
  });

  footer.appendChild(saveErrorBanner);
  footer.appendChild(saveBtn);
  container.appendChild(footer);

  return container;
}
