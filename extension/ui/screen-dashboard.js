/**
 * Reactron Screen A: Dashboard
 * 
 * Requirements:
 * - Show Reactron name at top with Library navigation.
 * - Display saved-game entries in a list above Add Game button.
 * - Each entry shows its Game Name and a right-aligned enable/disable toggle.
 * - Show an Add Game button below saved-game list.
 * - Under button: "Open the game tab you want to add a reaction to, then click Add Game."
 * - When user clicks Add Game: identify active Chrome tab, check URL eligibility.
 * - If duplicate identity detected: show non-blocking notification:
 *   "Game already added: [Game Name]" with button to return to existing Game Setup.
 * - Toggle tooltip explaining disabled game will not be monitored.
 */

import { createButton, createToggle, createEmptyState } from './components.js';

export function renderDashboard({
  games,
  gameStatuses = null,
  onNavigateToGameSetup,
  onNavigateToLibrary,
  onToggleGame,
  onDeleteGame,
  onToggleEmptyState,
  onAddGameFromTab
}) {
  const container = document.createElement('div');
  container.className = 'r-screen r-screen-dashboard';

  // Header Bar (Brand only)
  const header = document.createElement('header');
  header.className = 'r-dashboard-header';

  const brandGroup = document.createElement('div');
  brandGroup.className = 'r-brand-group';

  const logoIcon = document.createElement('span');
  logoIcon.className = 'r-brand-logo';
  logoIcon.textContent = '⚡';

  const titleEl = document.createElement('h1');
  titleEl.className = 'r-brand-title';
  titleEl.textContent = 'Reactron';

  brandGroup.appendChild(logoIcon);
  brandGroup.appendChild(titleEl);
  header.appendChild(brandGroup);
  container.appendChild(header);

  // Top Action Bar: Add Game and Library buttons Side by Side (in place of UI State Mock)
  const topActionsBar = document.createElement('div');
  topActionsBar.className = 'r-dashboard-top-actions';
  topActionsBar.style.display = 'flex';
  topActionsBar.style.gap = '8px';
  topActionsBar.style.marginBottom = '12px';
  topActionsBar.style.padding = '0 16px';

  const addGameTopBtn = createButton({
    text: 'Add Game',
    variant: 'primary',
    className: 'r-btn-flex',
    onClick: async () => {
      if (onAddGameFromTab) {
        onAddGameFromTab((duplicateGame, warningMessage) => {
          // Display non-blocking notification
          notificationArea.innerHTML = '';
          const banner = document.createElement('div');
          banner.className = 'r-warning-banner';

          if (duplicateGame) {
            banner.innerHTML = `
              <div class="r-banner-text">
                <span class="r-banner-icon">⚠️</span>
                <span>Game already added: <strong>${duplicateGame.name}</strong></span>
              </div>
            `;
            const returnBtn = createButton({
              text: 'Open Game Setup',
              variant: 'secondary',
              className: 'r-btn-sm',
              onClick: () => {
                onNavigateToGameSetup(duplicateGame.id);
              }
            });
            banner.appendChild(returnBtn);
          } else if (warningMessage) {
            banner.innerHTML = `
              <div class="r-banner-text">
                <span class="r-banner-icon">ℹ️</span>
                <span>${warningMessage}</span>
              </div>
            `;
          }

          notificationArea.appendChild(banner);
        });
      }
    }
  });

  const libraryTopBtn = createButton({
    text: 'Library',
    variant: 'secondary',
    className: 'r-btn-flex',
    onClick: onNavigateToLibrary
  });

  addGameTopBtn.style.flex = '1';
  libraryTopBtn.style.flex = '1';

  topActionsBar.appendChild(addGameTopBtn);
  topActionsBar.appendChild(libraryTopBtn);
  container.appendChild(topActionsBar);

  // Duplicate / Notification Banner Area
  const notificationArea = document.createElement('div');
  notificationArea.className = 'r-notification-area';
  container.appendChild(notificationArea);

  // Content Area
  const contentArea = document.createElement('div');
  contentArea.className = 'r-dashboard-content';

  if (games.length === 0) {
    // Distinct Empty State for Dashboard
    const emptyState = createEmptyState({
      title: 'No Games Configured Yet',
      description: 'Open a game tab and click Add Game button to start configuring custom visual reactions and overlays.'
    });
    contentArea.appendChild(emptyState);
  } else {
    // Populated Saved Games List
    const listContainer = document.createElement('div');
    listContainer.className = 'r-game-list';

    games.forEach((game) => {
      const item = document.createElement('div');
      item.className = `r-game-item ${!game.isEnabled ? 'disabled' : ''}`;

      const infoCol = document.createElement('div');
      infoCol.className = 'r-game-info';

      const status = (gameStatuses && (gameStatuses.get ? gameStatuses.get(game.id) : gameStatuses[game.id])) || null;

      const nameRow = document.createElement('div');
      nameRow.className = 'r-game-name-row';

      const nameEl = document.createElement('span');
      nameEl.className = 'r-game-name';
      nameEl.textContent = game.name;
      nameRow.appendChild(nameEl);

      const statusBadge = document.createElement('span');
      const regionsCount = game.watchRegions ? game.watchRegions.length : 0;
      const configuredReactionsCount = (game.watchRegions || []).reduce((sum, region) => {
        const configs = Array.isArray(region.reactionConfigs) ? region.reactionConfigs : [];
        const enabledCount = configs.filter(
          (c) => c && (c.gifReaction?.enabled || c.textReaction?.enabled)
        ).length;
        return sum + enabledCount;
      }, 0);
      let metaText = `${regionsCount} Watch Regions • ${configuredReactionsCount} Reactions`;

      if (!game.isEnabled) {
        statusBadge.className = 'r-badge r-badge-muted';
        statusBadge.textContent = 'Disabled';
        metaText += ' • Disabled (not monitored)';
      } else if (status?.status === 'ACTIVE') {
        statusBadge.className = 'r-badge r-badge-success';
        statusBadge.textContent = '🟢 Monitoring';
        metaText += ` • Triggered ${status.triggerCount || 0}x`;
      } else if (status?.status === 'UNSUPPORTED_PAGE') {
        statusBadge.className = 'r-badge r-badge-warning';
        statusBadge.textContent = '⚠️ Unsupported';
        metaText += ` • ${status.reason || 'Browser security prevents monitoring internal pages'}`;
      } else if (status?.status === 'PAUSED_NAVIGATED') {
        statusBadge.className = 'r-badge r-badge-idle';
        statusBadge.textContent = '⏸️ Paused';
        metaText += ` • ${status.reason || 'Tab navigated away from game URL'}`;
      } else {
        statusBadge.className = 'r-badge r-badge-idle';
        statusBadge.textContent = '⚪ Tab Not Open';
        metaText += ' • Open game tab to monitor';
      }

      nameRow.appendChild(statusBadge);

      const metaEl = document.createElement('span');
      metaEl.className = 'r-game-meta';
      metaEl.textContent = metaText;

      infoCol.appendChild(nameRow);
      infoCol.appendChild(metaEl);

      // Clicking anywhere on game info navigates to Game Setup
      infoCol.addEventListener('click', () => {
        onNavigateToGameSetup(game.id);
      });

      // Actions container (Delete button + Toggle)
      const actionsContainer = document.createElement('div');
      actionsContainer.className = 'r-game-actions';
      actionsContainer.style.display = 'flex';
      actionsContainer.style.alignItems = 'center';
      actionsContainer.style.gap = '8px';

      const deleteBtn = document.createElement('button');
      deleteBtn.className = 'r-btn-icon-delete';
      deleteBtn.title = `Delete ${game.name}`;
      deleteBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display: block;"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>';
      deleteBtn.style.background = 'transparent';
      deleteBtn.style.border = 'none';
      deleteBtn.style.cursor = 'pointer';
      deleteBtn.style.fontSize = '14px';
      deleteBtn.style.opacity = '0.6';
      deleteBtn.style.padding = '4px';
      deleteBtn.style.borderRadius = '4px';
      deleteBtn.onmouseover = () => { deleteBtn.style.opacity = '1'; deleteBtn.style.background = 'rgba(239, 68, 68, 0.1)'; };
      deleteBtn.onmouseout = () => { deleteBtn.style.opacity = '0.6'; deleteBtn.style.background = 'transparent'; };

      deleteBtn.onclick = (e) => {
        e.stopPropagation();
        showDeleteConfirmationModal(game, () => {
          if (onDeleteGame) {
            onDeleteGame(game.id);
          }
        });
      };

      // Right-aligned Enable/Disable Toggle with Explanatory Tooltip
      const toggleContainer = document.createElement('div');
      toggleContainer.className = 'r-toggle-wrapper';
      toggleContainer.title = game.isEnabled
        ? 'Active: Reactron will monitor this game'
        : 'Disabled: This game will not be monitored';

      const toggle = createToggle({
        checked: game.isEnabled,
        ariaLabel: `Enable or disable reactions for ${game.name}. A disabled game will not be monitored.`,
        onChange: (isChecked) => {
          onToggleGame(game.id, isChecked);
        }
      });

      toggleContainer.appendChild(toggle);
      actionsContainer.appendChild(toggleContainer);
      actionsContainer.appendChild(deleteBtn);

      item.appendChild(infoCol);
      item.appendChild(actionsContainer);
      listContainer.appendChild(item);
    });

    contentArea.appendChild(listContainer);
  }

  container.appendChild(contentArea);

  return container;
}

function showDeleteConfirmationModal(game, onConfirm) {
  const modalOverlay = document.createElement('div');
  modalOverlay.className = 'r-modal-overlay';
  modalOverlay.style.position = 'fixed';
  modalOverlay.style.top = '0';
  modalOverlay.style.left = '0';
  modalOverlay.style.width = '100%';
  modalOverlay.style.height = '100%';
  modalOverlay.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
  modalOverlay.style.display = 'flex';
  modalOverlay.style.alignItems = 'center';
  modalOverlay.style.justifyContent = 'center';
  modalOverlay.style.zIndex = '9999';

  const modalBox = document.createElement('div');
  modalBox.className = 'r-modal-box';
  modalBox.style.backgroundColor = '#222936';
  modalBox.style.border = '1px solid #374152';
  modalBox.style.borderRadius = '12px';
  modalBox.style.padding = '20px';
  modalBox.style.width = '90%';
  modalBox.style.maxWidth = '320px';
  modalBox.style.boxShadow = '0 10px 25px rgba(0,0,0,0.5)';
  modalBox.style.textAlign = 'center';

  modalBox.innerHTML = `
    <div style="font-size: 24px; margin-bottom: 8px;">🗑️</div>
    <h3 style="font-size: 15px; font-weight: 700; color: #F4F6FA; margin-bottom: 8px;">Delete Game</h3>
    <p style="font-size: 12px; color: #A9B3C4; margin-bottom: 16px; line-height: 1.4;">
      Are you sure you want to delete <strong>${game.name}</strong>? This will remove all watch regions and triggers for this game.
    </p>
    <div style="display: flex; gap: 8px;">
      <button id="modal-cancel" style="flex: 1; padding: 8px 12px; background: #171B24; border: 1px solid #374152; color: #F4F6FA; border-radius: 6px; font-size: 12px; font-weight: 600; cursor: pointer;">Cancel</button>
      <button id="modal-delete" style="flex: 1; padding: 8px 12px; background: #EF4444; border: none; color: white; border-radius: 6px; font-size: 12px; font-weight: 600; cursor: pointer;">Delete</button>
    </div>
  `;

  modalOverlay.appendChild(modalBox);
  document.body.appendChild(modalOverlay);

  modalBox.querySelector('#modal-cancel').onclick = () => {
    document.body.removeChild(modalOverlay);
  };

  modalBox.querySelector('#modal-delete').onclick = () => {
    document.body.removeChild(modalOverlay);
    onConfirm();
  };

  modalOverlay.onclick = (e) => {
    if (e.target === modalOverlay) {
      document.body.removeChild(modalOverlay);
    }
  };
}
