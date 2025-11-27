/**
 * Reusable animation utilities for smooth micro-interactions
 * Optimized for React Native performance
 */

import { Animated, Easing } from 'react-native';

/**
 * Fade in animation
 */
export const fadeIn = (
  animatedValue: Animated.Value,
  duration: number = 250,
  toValue: number = 1
): any => {
  return Animated.timing(animatedValue, {
    toValue,
    duration,
    easing: Easing.out(Easing.ease),
    useNativeDriver: true,
  });
};

/**
 * Fade out animation
 */
export const fadeOut = (
  animatedValue: Animated.Value,
  duration: number = 250,
  toValue: number = 0
): any => {
  return Animated.timing(animatedValue, {
    toValue,
    duration,
    easing: Easing.in(Easing.ease),
    useNativeDriver: true,
  });
};

/**
 * Scale animation - for button press feedback
 */
export const scaleAnimation = (
  animatedValue: Animated.Value,
  toValue: number
): any => {
  return Animated.spring(animatedValue, {
    toValue,
    friction: 5,
    tension: 100,
    useNativeDriver: true,
  });
};

/**
 * Slide in from bottom
 */
export const slideInFromBottom = (
  animatedValue: Animated.Value,
  duration: number = 350
): any => {
  return Animated.timing(animatedValue, {
    toValue: 0,
    duration,
    easing: Easing.out(Easing.cubic),
    useNativeDriver: true,
  });
};

/**
 * Slide out to bottom
 */
export const slideOutToBottom = (
  animatedValue: Animated.Value,
  toValue: number,
  duration: number = 250
): any => {
  return Animated.timing(animatedValue, {
    toValue,
    duration,
    easing: Easing.in(Easing.cubic),
    useNativeDriver: true,
  });
};

/**
 * Spring animation - for bouncy effects
 */
export const springAnimation = (
  animatedValue: Animated.Value,
  toValue: number
): any => {
  return Animated.spring(animatedValue, {
    toValue,
    friction: 7,
    tension: 40,
    useNativeDriver: true,
  });
};

/**
 * Shimmer effect for loading skeletons
 * Returns an animated value that loops indefinitely
 */
export const createShimmerAnimation = (): {
  animatedValue: Animated.Value;
  animation: any;
} => {
  const animatedValue = new Animated.Value(0);

  const animation = Animated.loop(
    Animated.sequence([
      Animated.timing(animatedValue, {
        toValue: 1,
        duration: 1000,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
      Animated.timing(animatedValue, {
        toValue: 0,
        duration: 1000,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    ])
  );

  return { animatedValue, animation };
};

/**
 * Stagger animation - for sequential item animations
 */
export const staggerAnimation = (
  animations: any[],
  staggerDelay: number = 50
): any => {
  return Animated.stagger(staggerDelay, animations);
};

/**
 * Pulse animation - for attention-grabbing effects
 */
export const pulseAnimation = (
  animatedValue: Animated.Value,
  minScale: number = 0.95,
  maxScale: number = 1.05
): any => {
  return Animated.loop(
    Animated.sequence([
      Animated.timing(animatedValue, {
        toValue: maxScale,
        duration: 600,
        easing: Easing.inOut(Easing.ease),
        useNativeDriver: true,
      }),
      Animated.timing(animatedValue, {
        toValue: minScale,
        duration: 600,
        easing: Easing.inOut(Easing.ease),
        useNativeDriver: true,
      }),
    ])
  );
};

/**
 * Rotate animation - for loading spinners
 */
export const rotateAnimation = (
  animatedValue: Animated.Value,
  duration: number = 1000
): any => {
  return Animated.loop(
    Animated.timing(animatedValue, {
      toValue: 1,
      duration,
      easing: Easing.linear,
      useNativeDriver: true,
    })
  );
};

/**
 * Create interpolated rotation value
 */
export const createRotationInterpolation = (animatedValue: Animated.Value) => {
  return animatedValue.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });
};
