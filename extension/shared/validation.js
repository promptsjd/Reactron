/**
 * Reactron Shared Validation Rules
 * Centralized validation for game names, reaction names, and numeric ranges.
 */

export const VALIDATION_LIMITS = {
  GAME_NAME_MAX_LENGTH: 15,
  REACTION_NAME_MAX_LENGTH: 15,
  DELAY_MIN: 0,
  DELAY_MAX: 3,
  DELAY_STEP: 0.5,
  DURATION_MIN: 1,
  DURATION_MAX: 10,
  DURATION_STEP: 1,
  STRICTNESS_MIN: 1,
  STRICTNESS_MAX: 100
};

/**
 * Validates a Game Name input
 * @param {string} name - Proposed name
 * @param {Array<{id: string, name: string}>} existingGames - Currently saved games
 * @param {string} [currentGameId] - ID of game being edited (to skip self duplicate)
 * @returns {{isValid: boolean, error: string|null}}
 */
export function validateGameName(name, existingGames = [], currentGameId = null) {
  const trimmed = (name || '').trim();

  if (!trimmed) {
    return {
      isValid: false,
      error: 'Game Name is required'
    };
  }

  if (trimmed.length > VALIDATION_LIMITS.GAME_NAME_MAX_LENGTH) {
    return {
      isValid: false,
      error: `Game Name cannot exceed ${VALIDATION_LIMITS.GAME_NAME_MAX_LENGTH} characters`
    };
  }

  // Check duplicate (case-insensitive)
  const isDuplicate = existingGames.some(
    (g) => g.id !== currentGameId && g.name.toLowerCase() === trimmed.toLowerCase()
  );

  if (isDuplicate) {
    return {
      isValid: false,
      error: 'A game with this name already exists'
    };
  }

  return {
    isValid: true,
    error: null
  };
}

/**
 * Validates a Reaction Name input
 * @param {string} name - Proposed name
 * @returns {{isValid: boolean, error: string|null}}
 */
export function validateReactionName(name) {
  const trimmed = (name || '').trim();

  if (trimmed.length > VALIDATION_LIMITS.REACTION_NAME_MAX_LENGTH) {
    return {
      isValid: false,
      error: `Reaction Name cannot exceed ${VALIDATION_LIMITS.REACTION_NAME_MAX_LENGTH} characters`
    };
  }

  return {
    isValid: true,
    error: null
  };
}

/**
 * Validates that a reaction configuration has required content for its selected type
 * @param {'gif'|'text'|null} selectedType
 * @param {import('./types.js').GifImageReaction} [gifData]
 * @param {import('./types.js').TextReaction} [textData]
 * @returns {{isValid: boolean, error: string|null}}
 */
export function validateReactionContent(selectedType, gifData, textData) {
  if (!selectedType) {
    return {
      isValid: false,
      error: 'Please select a reaction type (Gif/Image or Text).'
    };
  }

  if (selectedType === 'gif') {
    const hasMedia = Boolean((gifData?.fileUrl || '').trim() || gifData?.mediaAssetId);
    if (!hasMedia) {
      return {
        isValid: false,
        error: 'Please select a GIF/Image file first.'
      };
    }
  }

  if (selectedType === 'text') {
    const hasText = Boolean((textData?.text || '').trim());
    if (!hasText) {
      return {
        isValid: false,
        error: 'Please enter reaction text first.'
      };
    }
  }

  return {
    isValid: true,
    error: null
  };
}
