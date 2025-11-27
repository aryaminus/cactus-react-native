/**
 * Haptic feedback utilities for better user experience
 * Provides tactile feedback for user interactions using React Native's built-in Vibration API
 */

import { Vibration, Platform } from 'react-native';

/**
 * Light impact - for subtle interactions like button presses
 */
export const lightHaptic = () => {
  if (Platform.OS === 'ios' || Platform.OS === 'android') {
    Vibration.vibrate(10);
  }
};

/**
 * Medium impact - for standard interactions
 */
export const mediumHaptic = () => {
  if (Platform.OS === 'ios' || Platform.OS === 'android') {
    Vibration.vibrate(20);
  }
};

/**
 * Heavy impact - for important actions
 */
export const heavyHaptic = () => {
  if (Platform.OS === 'ios' || Platform.OS === 'android') {
    Vibration.vibrate(30);
  }
};

/**
 * Success haptic - for successful operations
 */
export const successHaptic = () => {
  if (Platform.OS === 'ios' || Platform.OS === 'android') {
    Vibration.vibrate([0, 10, 50, 10]);
  }
};

/**
 * Warning haptic - for warnings
 */
export const warningHaptic = () => {
  if (Platform.OS === 'ios' || Platform.OS === 'android') {
    Vibration.vibrate([0, 15, 30, 15]);
  }
};

/**
 * Error haptic - for errors
 */
export const errorHaptic = () => {
  if (Platform.OS === 'ios' || Platform.OS === 'android') {
    Vibration.vibrate([0, 20, 40, 20, 40, 20]);
  }
};

/**
 * Selection haptic - for selection changes
 */
export const selectionHaptic = () => {
  if (Platform.OS === 'ios' || Platform.OS === 'android') {
    Vibration.vibrate(5);
  }
};
