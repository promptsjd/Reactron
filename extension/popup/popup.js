/**
 * Reactron Stage 2 Extension Application Controller
 * 
 * Coordinates:
 * - GameManagementService (real tab query, duplicate identity, persistence)
 * - RegionManagementService (watch region selection, normalized geometry, atomic configuration)
 * - Screen A: Dashboard
 * - Screen B: Game Setup
 * - Screen D: Library Placeholder
 */

import { gameManagementService } from '../services/game-management-service.js';
import { persistenceService } from '../services/persistence-service.js';
import { detectionService } from '../services/detection-service.js';
import { mockDataService } from '../shared/mock-data.js';
import { renderDashboard } from '../ui/screen-dashboard.js';
import { renderGameSetup } from '../ui/screen-game-setup.js';
import { renderLibrary } from '../ui/screen-library.js';

class AppController {
  constructor() {
    this.appRoot = document.getElementById('app');
    this.currentScreen = 'dashboard'; // 'dashboard' | 'game-setup' | 'library'
    this.selectedGameId = null;
    this.draftGame = null;
    this.activeTabInfo = null;
  }

  async init() {
    try {
      await persistenceService.initialize();
    } catch (err) {
      console.warn('[Reactron] Persistence initialization warning:', err);
    }

    try {
      await gameManagementService.initialize();
    } catch (err) {
      console.warn('[Reactron] Game management initialization warning:', err);
    }

    // Render UI immediately so the side panel is never left blank
    await this.render();

    // Attach detection status listener to update badges dynamically
    try {
      detectionService.onStatusChange(() => {
        if (this.currentScreen === 'dashboard') {
          this.render();
        }
      });
    } catch (err) {
      console.warn('[Reactron] Detection status listener warning:', err);
    }

    // Synchronize detection sessions with tabs in background without blocking initial render
    try {
      await detectionService.syncWithGames(gameManagementService.getGames());
    } catch (err) {
      console.warn('[Reactron] Detection sync warning:', err);
    }
  }

  async navigateTo(screen, gameId = null) {
    this.currentScreen = screen;
    this.selectedGameId = gameId;
    await this.render();
  }

  async render() {
    if (!this.appRoot) {
      this.appRoot = document.getElementById('app');
    }
    if (!this.appRoot) return;
    this.appRoot.innerHTML = '';

    const games = gameManagementService.getGames();

    switch (this.currentScreen) {
      case 'dashboard': {
        const dashboardView = renderDashboard({
          games,
          gameStatuses: detectionService.getAllStatuses(),
          onNavigateToGameSetup: (gameId) => this.navigateTo('game-setup', gameId),
          onNavigateToLibrary: () => this.navigateTo('library'),
          onToggleGame: async (gameId, isChecked) => {
            await gameManagementService.toggleGameEnabled(gameId, isChecked);
            await detectionService.syncWithGames(gameManagementService.getGames());
            this.render();
          },
          onDeleteGame: async (gameId) => {
            await gameManagementService.deleteGame(gameId);
            await detectionService.syncWithGames(gameManagementService.getGames());
            this.render();
          },
          onAddGameFromTab: async (onNotify) => {
            // Identify active tab and obtain URL/title
            const tabInfo = await gameManagementService.getActiveTab();
            this.activeTabInfo = tabInfo;

            // Check eligibility (reject internal browser pages)
            if (!tabInfo.eligibility.isEligible) {
              onNotify(null, tabInfo.eligibility.reason || 'This tab cannot be added.');
              return;
            }

            // Check duplicate identity using centralized GameIdentityService
            const existingGame = gameManagementService.findGameByUrl(tabInfo.url);
            if (existingGame) {
              // Show non-blocking notification with link to return to existing game
              onNotify(existingGame, null);
              return;
            }

            // Create draft game with stable internal ID
            this.draftGame = gameManagementService.createDraftGame(tabInfo.url, tabInfo.title);
            this.navigateTo('game-setup', null);
          }
        });
        this.appRoot.appendChild(dashboardView);
        break;
      }

      case 'game-setup': {
        let targetGame = this.selectedGameId
          ? gameManagementService.getGameById(this.selectedGameId)
          : this.draftGame;

        if (!targetGame) {
          targetGame = gameManagementService.createDraftGame(
            'https://poki.com/en/g/active-tab-game',
            'Active Game Tab'
          );
          this.draftGame = targetGame;
        }

        const gameSetupView = renderGameSetup({
          game: targetGame,
          existingGames: games,
          onBackToDashboard: () => {
            this.draftGame = null;
            this.navigateTo('dashboard');
          },
          onSaveGame: async (savedGame) => {
            const saveResult = await gameManagementService.saveGame(savedGame);
            if (saveResult.success) {
              this.draftGame = null;
              await detectionService.syncWithGames(gameManagementService.getGames());
            }
            return saveResult;
          },
          onTriggerAreaSelection: async (regionId, onCaptured) => {
            const isWebTab = (t) => {
              if (!t || !t.id) return false;
              const url = (t.url || t.pendingUrl || '').toLowerCase();
              return (
                !url.startsWith('chrome://') &&
                !url.startsWith('chrome-extension://') &&
                !url.startsWith('edge://') &&
                !url.startsWith('about:') &&
                !url.startsWith('devtools://')
              );
            };

            // Send trigger message to active tab content script
            if (typeof chrome !== 'undefined' && chrome.tabs && chrome.tabs.query) {
              const findAndSend = async () => {
                let candidateTab = null;

                // 1. Check known active tab from creation/navigation
                if (this.activeTabInfo?.id) {
                  try {
                    const tab = await chrome.tabs.get(this.activeTabInfo.id);
                    if (tab && isWebTab(tab)) {
                      candidateTab = tab;
                    }
                  } catch {
                    // Tab may have closed or changed
                  }
                }

                // 2. Query last focused window (main browser window next to side panel)
                if (!candidateTab) {
                  const focused = await new Promise((res) => {
                    chrome.tabs.query({ active: true, lastFocusedWindow: true }, (tabs) => res(tabs || []));
                  });
                  candidateTab = focused.find(isWebTab);
                }

                // 3. Query current window
                if (!candidateTab) {
                  const current = await new Promise((res) => {
                    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => res(tabs || []));
                  });
                  candidateTab = current.find(isWebTab);
                }

                // 4. Query any active web tab
                if (!candidateTab) {
                  const allActive = await new Promise((res) => {
                    chrome.tabs.query({ active: true }, (tabs) => res(tabs || []));
                  });
                  candidateTab = allActive.find(isWebTab);
                }

                if (!candidateTab?.id) {
                  console.warn('[Reactron] No active game tab found for area selection');
                  return;
                }

                // Ensure content script and stylesheet are loaded on the target tab
                if (chrome.scripting && chrome.scripting.executeScript) {
                  try {
                    await chrome.scripting.executeScript({
                      target: { tabId: candidateTab.id },
                      files: ['content/content-script.js']
                    });
                    if (chrome.scripting.insertCSS) {
                      await chrome.scripting.insertCSS({
                        target: { tabId: candidateTab.id },
                        files: ['content/content-style.css']
                      });
                    }
                  } catch (err) {
                    // Script may already be injected, safe to continue
                  }
                }

                chrome.tabs.sendMessage(
                  candidateTab.id,
                  { action: 'START_REGION_SELECTION', regionId },
                  () => {
                    if (chrome.runtime.lastError) {
                      console.warn('[Reactron] Tab message fallback:', chrome.runtime.lastError.message);
                    }
                  }
                );
              };

              findAndSend();
            } else {
              // Non-extension preview fallback only
              setTimeout(() => {
                const mockDataUrl = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="240" height="70" viewBox="0 0 240 70"><rect width="240" height="70" fill="%23171B24"/><rect x="20" y="24" width="200" height="22" rx="4" fill="%23222936" stroke="%23374152"/><rect x="22" y="26" width="160" height="18" rx="2" fill="%2355C5A0"/><text x="24" y="18" fill="%23A9B3C4" font-size="11" font-family="sans-serif">REGION CAPTURED (PREVIEW)</text></svg>';
                onCaptured({
                  regionId,
                  previewUrl: mockDataUrl,
                  geometry: { x: 0.1, y: 0.05, width: 0.35, height: 0.12, viewportWidth: 1280, viewportHeight: 720 }
                });
              }, 500);
            }
          }
        });
        this.appRoot.appendChild(gameSetupView);
        break;
      }

      case 'library': {
        const presets = await persistenceService.getLibraryPresets();
        const libraryGifs = presets.filter((p) => p.type === 'gif');
        const libraryTexts = presets.filter((p) => p.type === 'text');
        const libraryView = renderLibrary({
          libraryGifs,
          libraryTexts,
          onBackToDashboard: () => this.navigateTo('dashboard'),
          onDeletePreset: async (presetId) => {
            await persistenceService.deleteLibraryPreset(presetId);
          }
        });
        this.appRoot.appendChild(libraryView);
        break;
      }

      default:
        this.navigateTo('dashboard');
    }
  }
}

function startApp() {
  const controller = new AppController();
  controller.init().catch((err) => {
    console.error('[Reactron] Top-level controller failure:', err);
    const root = document.getElementById('app');
    if (root && root.children.length === 0) {
      root.innerHTML = `
        <div style="padding: 24px 16px; color: #F4F6FA; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; text-align: center;">
          <div style="font-size: 28px; margin-bottom: 8px;">⚡</div>
          <h2 style="font-size: 15px; font-weight: 700; margin-bottom: 6px;">Reactron</h2>
          <p style="font-size: 12px; color: #A9B3C4; margin-bottom: 16px;">Failed to initialize side panel: ${err?.message || 'Unknown error'}</p>
          <button onclick="window.location.reload()" style="background: #607DFA; color: white; border: none; padding: 8px 16px; border-radius: 6px; cursor: pointer; font-size: 12px; font-weight: 600;">Reload Panel</button>
        </div>
      `;
    }
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', startApp);
} else {
  // Side panel DOM is already interactive or complete
  startApp();
}
