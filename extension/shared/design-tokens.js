/**
 * Reactron Shared Design Tokens
 * Single source of truth for colors, typography, spacing, and styling.
 * Strictly adheres to the Stage 1 approved design system:
 * - App background: #171B24
 * - Panel background: #222936
 * - Primary action: #607DFA
 * - Primary hover: #4F6CE0
 * - Main text: #F4F6FA
 * - Secondary text: #A9B3C4
 * - Border: #374152
 * - Success: #55C5A0
 * - Warning: #E9B765
 * - No neon styling.
 */

export const DESIGN_TOKENS = {
  colors: {
    appBackground: '#171B24',
    panelBackground: '#222936',
    panelBackgroundSubtle: '#1C222E',
    panelBackgroundHover: '#2A3342',
    primaryAction: '#607DFA',
    primaryHover: '#4F6CE0',
    primarySubtle: 'rgba(96, 125, 250, 0.12)',
    primaryBorder: 'rgba(96, 125, 250, 0.35)',
    mainText: '#F4F6FA',
    secondaryText: '#A9B3C4',
    mutedText: '#778294',
    border: '#374152',
    borderLight: '#475366',
    borderFocus: '#607DFA',
    success: '#55C5A0',
    successSubtle: 'rgba(85, 197, 160, 0.15)',
    warning: '#E9B765',
    warningSubtle: 'rgba(233, 183, 101, 0.15)',
    danger: '#E05D5D',
    dangerSubtle: 'rgba(224, 93, 93, 0.15)',
    overlayBackdrop: 'rgba(15, 18, 25, 0.75)'
  },
  typography: {
    fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    fontSize: {
      xs: '11px',
      sm: '12px',
      base: '13px',
      md: '14px',
      lg: '16px',
      xl: '18px'
    },
    fontWeight: {
      normal: '400',
      medium: '500',
      semibold: '600',
      bold: '700'
    },
    lineHeight: {
      tight: '1.2',
      normal: '1.4',
      relaxed: '1.6'
    }
  },
  radii: {
    xs: '4px',
    sm: '6px',
    md: '8px',
    lg: '12px',
    xl: '16px',
    full: '9999px'
  },
  spacing: {
    xs: '4px',
    sm: '8px',
    md: '12px',
    lg: '16px',
    xl: '20px',
    xxl: '24px'
  },
  transitions: {
    fast: '150ms cubic-bezier(0.4, 0, 0.2, 1)',
    normal: '200ms cubic-bezier(0.4, 0, 0.2, 1)'
  }
};
