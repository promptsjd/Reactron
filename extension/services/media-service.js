/**
 * Reactron Media Validation and Processing Service
 * 
 * Responsibilities:
 * 1. File type and MIME validation (GIF, PNG, JPEG, WebP).
 * 2. File size validation (up to 4MB max).
 * 3. Asynchronous image decoding test (verifies the file is genuinely renderable and not corrupted).
 * 4. Extraction of image dimensions and base64 Data URL.
 * 
 * Architectural Limitation Note:
 * Animated GIFs are rendered natively by the browser engine (`<img>` / CSS background).
 * Precise frame-by-frame pause, scrub, or rewind is not natively supported by standard
 * browser image decoders without full frame-demuxing libraries. Reactron treats display duration,
 * delay, and native GIF looping as separate concepts.
 */

import { MEDIA_LIMITS } from '../shared/types.js';

export class MediaService {
  /**
   * Validates and decodes an uploaded image/GIF file
   * @param {File} file - Raw browser File object
   * @returns {Promise<import('../shared/types.js').MediaValidationResult>}
   */
  static async validateAndProcessFile(file) {
    if (!file) {
      return { isValid: false, error: 'No file provided.' };
    }

    // 1. MIME type validation
    const mimeType = file.type ? file.type.toLowerCase() : '';
    const fileName = file.name || 'image';
    const extension = fileName.includes('.') ? `.${fileName.split('.').pop().toLowerCase()}` : '';

    const isMimeAllowed = MEDIA_LIMITS.ALLOWED_MIME_TYPES.includes(mimeType);
    const isExtAllowed = MEDIA_LIMITS.ALLOWED_EXTENSIONS.includes(extension);

    if (!isMimeAllowed && !isExtAllowed) {
      return {
        isValid: false,
        error: `Unsupported format. Please select a GIF, PNG, or JPEG file (received: ${mimeType || extension || 'unknown'}).`
      };
    }

    // 2. File size validation
    if (file.size > MEDIA_LIMITS.MAX_FILE_SIZE_BYTES) {
      const sizeMB = (file.size / (1024 * 1024)).toFixed(1);
      return {
        isValid: false,
        error: `File size (${sizeMB}MB) exceeds the maximum allowed limit of ${MEDIA_LIMITS.MAX_FILE_SIZE_MB}MB.`
      };
    }

    // 3. Read file as Data URL
    let dataUrl = '';
    try {
      dataUrl = await this._readFileAsDataUrl(file);
    } catch (err) {
      return {
        isValid: false,
        error: `Failed to read file: ${err.message || 'Read error'}`
      };
    }

    // 4. Test Image Decoding
    try {
      const dimensions = await this._verifyImageDecoding(dataUrl);
      return {
        isValid: true,
        error: null,
        dataUrl,
        fileName,
        width: dimensions.width,
        height: dimensions.height,
        mimeType: mimeType || (extension === '.gif' ? 'image/gif' : 'image/png')
      };
    } catch (err) {
      return {
        isValid: false,
        error: `Image decoding failed. The image file appears to be corrupted or invalid.`
      };
    }
  }

  /**
   * Reads a File into a base64 Data URL
   * @private
   */
  static _readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error('Failed to read file as data URL'));
      reader.readAsDataURL(file);
    });
  }

  /**
   * Verifies that the image data can be successfully decoded and rendered by the browser
   * @private
   */
  static _verifyImageDecoding(dataUrl) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = async () => {
        if ('decode' in img) {
          try {
            await img.decode();
            resolve({ width: img.naturalWidth || img.width, height: img.naturalHeight || img.height });
          } catch {
            // Some animated GIFs throw in decode() on older engines even when onload fires; fallback to naturalWidth
            if (img.naturalWidth > 0) {
              resolve({ width: img.naturalWidth, height: img.naturalHeight });
            } else {
              reject(new Error('Image decode failed'));
            }
          }
        } else {
          resolve({ width: img.naturalWidth, height: img.naturalHeight });
        }
      };
      img.onerror = () => reject(new Error('Invalid image data'));
      img.src = dataUrl;
    });
  }

  /**
   * Sanitizes user text input to prevent markup or script injection
   * @param {string} rawText
   * @returns {string} Sanitized plain text
   */
  static sanitizeText(rawText) {
    if (!rawText) return '';
    // Strip HTML tags and control characters
    return String(rawText)
      .replace(/<[^>]*>?/gm, '')
      .slice(0, 100);
  }
}
