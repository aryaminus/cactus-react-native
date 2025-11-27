/**
 * Centralized theme system for consistent design across the app
 * Following modern mobile UX trends with glassmorphism and depth
 * Now with dark mode support!
 */

import { useColorScheme } from 'react-native';

// Light theme colors
const lightColors = {
  // Primary - Modern blue with gradient options
  primary: '#0A84FF',
  primaryLight: '#64B5F6',
  primaryDark: '#0066CC',
  primaryGradientStart: '#0A84FF',
  primaryGradientEnd: '#0066CC',

  // Backgrounds - Layered depth
  background: '#FFFFFF',
  backgroundSecondary: '#F5F5F7',
  backgroundTertiary: '#E5E5EA',

  // Glass effects - Glassmorphism
  glassLight: 'rgba(255, 255, 255, 0.7)',
  glassMedium: 'rgba(255, 255, 255, 0.5)',
  glassDark: 'rgba(0, 0, 0, 0.7)',
  glassOverlay: 'rgba(0, 0, 0, 0.3)',

  // Semantic colors
  success: '#34C759',
  successLight: '#E8F5E9',
  warning: '#FF9500',
  warningLight: '#FFF3E0',
  error: '#FF3B30',
  errorLight: '#FFEBEE',
  info: '#0A84FF',
  infoLight: '#E3F2FD',

  // Text hierarchy
  textPrimary: '#000000',
  textSecondary: '#6C6C70',
  textTertiary: '#AEAEB2',
  textInverse: '#FFFFFF',

  // Borders
  border: '#E5E5EA',
  borderLight: '#F2F2F7',
  borderDark: '#D1D1D6',
};

// Dark theme colors
const darkColors = {
  // Primary - Brighter for dark mode
  primary: '#0A84FF',
  primaryLight: '#64B5F6',
  primaryDark: '#0066CC',
  primaryGradientStart: '#0A84FF',
  primaryGradientEnd: '#0066CC',

  // Backgrounds - Dark layered depth
  background: '#000000',
  backgroundSecondary: '#1C1C1E',
  backgroundTertiary: '#2C2C2E',

  // Glass effects - Dark glassmorphism
  glassLight: 'rgba(255, 255, 255, 0.1)',
  glassMedium: 'rgba(255, 255, 255, 0.05)',
  glassDark: 'rgba(0, 0, 0, 0.9)',
  glassOverlay: 'rgba(0, 0, 0, 0.5)',

  // Semantic colors - Adjusted for dark mode
  success: '#30D158',
  successLight: 'rgba(48, 209, 88, 0.15)',
  warning: '#FF9F0A',
  warningLight: 'rgba(255, 159, 10, 0.15)',
  error: '#FF453A',
  errorLight: 'rgba(255, 69, 58, 0.15)',
  info: '#0A84FF',
  infoLight: 'rgba(10, 132, 255, 0.15)',

  // Text hierarchy - Inverted for dark mode
  textPrimary: '#FFFFFF',
  textSecondary: '#AEAEB2',
  textTertiary: '#6C6C70',
  textInverse: '#000000',

  // Borders - Lighter for dark mode
  border: '#38383A',
  borderLight: '#2C2C2E',
  borderDark: '#48484A',
};

// Base theme structure (non-color properties)
const baseTheme = {
  // Typography scale
  typography: {
    // Font sizes
    fontSize: {
      'xs': 12,
      'sm': 14,
      'base': 16,
      'lg': 18,
      'xl': 20,
      '2xl': 24,
      '3xl': 32,
      '4xl': 40,
      '5xl': 48,
    },

    // Font weights
    fontWeight: {
      regular: '400' as const,
      medium: '500' as const,
      semibold: '600' as const,
      bold: '700' as const,
    },

    // Line heights
    lineHeight: {
      tight: 1.2,
      normal: 1.5,
      relaxed: 1.75,
    },
  },

  // Spacing system - 8pt grid
  spacing: {
    'xs': 4,
    'sm': 8,
    'md': 12,
    'base': 16,
    'lg': 20,
    'xl': 24,
    '2xl': 32,
    '3xl': 40,
    '4xl': 48,
    '5xl': 64,
  },

  // Border radius scale
  borderRadius: {
    sm: 8,
    base: 12,
    md: 16,
    lg: 20,
    xl: 24,
    full: 9999,
  },

  // Shadows - Layered depth
  shadows: {
    sm: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.05,
      shadowRadius: 2,
      elevation: 1,
    },
    base: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.1,
      shadowRadius: 4,
      elevation: 3,
    },
    md: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.15,
      shadowRadius: 8,
      elevation: 5,
    },
    lg: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.2,
      shadowRadius: 16,
      elevation: 8,
    },
    xl: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 12 },
      shadowOpacity: 0.25,
      shadowRadius: 24,
      elevation: 12,
    },
  },

  // Animation timings
  animation: {
    duration: {
      fast: 150,
      base: 250,
      slow: 350,
      slower: 500,
    },
    easing: {
      default: 'ease-in-out',
      spring: 'cubic-bezier(0.68, -0.55, 0.265, 1.55)',
      smooth: 'cubic-bezier(0.4, 0, 0.2, 1)',
    },
  },

  // Touch targets - Accessibility
  touchTarget: {
    minSize: 44, // iOS/Android minimum
  },
} as const;

// Create light theme (default export for backwards compatibility)
export const theme = {
  ...baseTheme,
  colors: lightColors,
} as const;

// Create dark theme
export const darkTheme = {
  ...baseTheme,
  colors: darkColors,
} as const;

// Hook to get the current theme based on system preference
export const useTheme = () => {
  const colorScheme = useColorScheme();
  return colorScheme === 'dark' ? darkTheme : theme;
};

// Type exports for TypeScript
export type Theme = typeof theme;
export type ThemeColors = typeof theme.colors;
export type ThemeSpacing = typeof theme.spacing;
