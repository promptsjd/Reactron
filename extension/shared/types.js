/**
 * Reactron Shared Data Models and Types
 * Single source of truth for game, region, reaction, overlay, and media configurations.
 */

/**
 * Normalized viewport coordinates (relative to content viewport 0.0 - 1.0)
 * Preserves resolution independence across screen sizes and resizes.
 * @typedef {Object} NormalizedGeometry
 * @property {number} x - Left offset ratio (0.0 to 1.0)
 * @property {number} y - Top offset ratio (0.0 to 1.0)
 * @property {number} width - Width ratio (0.0 to 1.0)
 * @property {number} height - Height ratio (0.0 to 1.0)
 * @property {number} viewportWidth - Viewport width at capture time
 * @property {number} viewportHeight - Viewport height at capture time
 */

/**
 * Normalized position ratio on screen (0.0 to 1.0)
 * @typedef {Object} NormalizedPosition
 * @property {number} xRatio - Center X ratio (0.0 to 1.0, 0.5 is horizontal center)
 * @property {number} yRatio - Center Y ratio (0.0 to 1.0, 0.35 is upper third)
 */

/**
 * @typedef {Object} GameEntry
 * @property {string} id - Stable internal game identifier (UUID or secure hash)
 * @property {string} name - Game display name (1-15 characters)
 * @property {string} url - Original game tab URL
 * @property {string} canonicalIdentity - Normalized identity key for duplicate comparison
 * @property {boolean} isEnabled - Whether overlays are active for this game
 * @property {Array<WatchRegion>} watchRegions - Associated watch regions
 * @property {number} createdAt - Creation timestamp
 * @property {number} updatedAt - Update timestamp
 */

/**
 * @typedef {Object} WatchRegion
 * @property {string} id - Stable internal region identifier (UUID)
 * @property {string} name - Region name (e.g. "Watch Region 1")
 * @property {number} strictness - Strictness percentage (1-100)
 * @property {NormalizedGeometry} [geometry] - Normalized viewport coordinates
 * @property {string} [previewUrl] - Cropped snapshot data URL of the selected area
 * @property {Array<ReactionConfig>} reactionConfigs - Configured reactions for this region
 */

/**
 * @typedef {Object} ReactionConfig
 * @property {string} id - Unique reaction configuration ID
 * @property {string} [regionId] - Parent Watch Region ID
 * @property {'gif'|'text'|null} [type] - Selected reaction type ('gif' | 'text' | null)
 * @property {string} [customTitle] - Optional user override title
 * @property {GifImageReaction} [gifReaction] - Optional GIF/image reaction settings
 * @property {TextReaction} [textReaction] - Optional text reaction settings
 */

/**
 * @typedef {Object} GifImageReaction
 * @property {boolean} enabled - Whether GIF reaction is active
 * @property {string} [name] - Generated or preset label
 * @property {string} [mediaAssetId] - Referenced media asset ID in IndexedDB
 * @property {string} [fileUrl] - Image/GIF URL or base64 data URL
 * @property {string} [fileName] - Original uploaded filename
 * @property {number} size - Size in pixels (e.g. 80 - 400)
 * @property {number} delaySeconds - Delay before display (0 to 3 in 0.5s steps)
 * @property {number} durationSeconds - Duration to display (1 to 10s)
 * @property {boolean} saveToLibrary - Checkbox for library saving
 * @property {NormalizedPosition} [position] - Normalized screen coordinates
 */

/**
 * @typedef {Object} TextReaction
 * @property {boolean} enabled - Whether text reaction is active
 * @property {string} [name] - Generated or preset label
 * @property {string} text - The displayed text string (strictly sanitized)
 * @property {number} fontSize - Font size in px (18 to 56)
 * @property {string} fontColor - Hex color string
 * @property {string} fontType - Chosen font family option
 * @property {string} animationStyle - Chosen animation style option
 * @property {number} delaySeconds - Delay before display (0 to 3 in 0.5s steps)
 * @property {number} durationSeconds - Duration to display (1 to 10s)
 * @property {boolean} saveToLibrary - Checkbox for library saving
 * @property {NormalizedPosition} [position] - Normalized screen coordinates
 */

/**
 * @typedef {Object} MediaValidationResult
 * @property {boolean} isValid
 * @property {string|null} error
 * @property {string|null} [dataUrl]
 * @property {string|null} [fileName]
 * @property {number} [width]
 * @property {number} [height]
 * @property {string} [mimeType]
 */

export const FONT_OPTIONS = [
  { id: 'impact', label: 'Impact / Arcade' },
  { id: 'inter', label: 'Inter Modern' },
  { id: 'comic', label: 'Playful Bold' },
  { id: 'mono', label: 'Retro Monospace' },
  { id: 'serif', label: 'Cinematic Serif' }
];

export const ANIMATION_OPTIONS = [
  { id: 'pop-in', label: 'Pop & Scale' },
  { id: 'slide-top', label: 'Slide from Top' },
  { id: 'shake-burst', label: 'Screen Shake' },
  { id: 'fade-zoom', label: 'Fade & Zoom' },
  { id: 'flash-pulse', label: 'Flash Pulse' }
];

export const MEDIA_LIMITS = {
  MAX_FILE_SIZE_BYTES: 4 * 1024 * 1024, // 4MB
  MAX_FILE_SIZE_MB: 4,
  ALLOWED_MIME_TYPES: ['image/gif', 'image/png', 'image/jpeg', 'image/webp'],
  ALLOWED_EXTENSIONS: ['.gif', '.png', '.jpg', '.jpeg', '.webp']
};

export const REACTION_CONFIG_CONSTANTS = {
  MAX_REACTIONS_PER_REGION: 2,
  LABEL_PREFIX: 'Reaction',
  TYPES: {
    GIF: 'gif',
    TEXT: 'text'
  },
  RADIO_OPTIONS: [
    { id: 'gif', label: 'Gif/Image' },
    { id: 'text', label: 'Text' }
  ],
  FILLER_DEFAULTS: {
    GIF: {
      fileName: '',
      fileUrl: '',
      size: 180,
      delaySeconds: 0,
      durationSeconds: 3,
      position: { xRatio: 0.5, yRatio: 0.35 }
    },
    TEXT: {
      text: '',
      placeholder: 'Enter reaction text...',
      fontSize: 32,
      fontColor: '#F4F6FA',
      fontType: 'impact',
      animationStyle: 'pop-in',
      delaySeconds: 0,
      durationSeconds: 3,
      position: { xRatio: 0.5, yRatio: 0.6 }
    }
  }
};

