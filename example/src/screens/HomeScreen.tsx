import { useEffect, useRef, useLayoutEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  StatusBar,
  Animated,
  useColorScheme,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { launchCamera, launchImageLibrary } from 'react-native-image-picker';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { theme, useTheme } from '../theme';
import { fadeIn } from '../animations';
import { lightHaptic } from '../haptics';

type Props = NativeStackScreenProps<any, 'Home'>;

export const HomeScreen = ({ navigation }: Props) => {
  // Get current theme (light or dark)
  const currentTheme = useTheme();
  const colorScheme = useColorScheme();

  // Animation values
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    fadeIn(fadeAnim).start();
  }, [fadeAnim]);

  // Hide header
  useLayoutEffect(() => {
    navigation.setOptions({ headerShown: false });
  }, [navigation]);

  const handleCamera = async () => {
    lightHaptic();
    const result = await launchCamera({
      mediaType: 'photo',
      includeBase64: false,
    });

    const firstAsset = result.assets?.[0];
    if (firstAsset?.uri) {
      navigation.navigate('Scan', { imageUri: firstAsset.uri });
    }
  };

  const handleGallery = async () => {
    lightHaptic();
    const result = await launchImageLibrary({
      mediaType: 'photo',
      selectionLimit: 0, // 0 means unlimited
      includeBase64: false,
    });

    if (result.assets && result.assets.length > 0) {
      const firstAsset = result.assets[0];
      if (result.assets.length === 1 && firstAsset?.uri) {
        navigation.navigate('Scan', { imageUri: firstAsset.uri });
      } else {
        // Handle multiple images
        const uris = result.assets
          .map((a) => a.uri)
          .filter((u): u is string => !!u);
        if (uris.length > 0) {
          navigation.navigate('Scan', {
            imageUri: uris[0],
            batchImages: uris,
          });
        }
      }
    }
  };

  return (
    <SafeAreaView
      style={[
        styles.container,
        { backgroundColor: currentTheme.colors.background },
      ]}
    >
      <StatusBar
        barStyle={colorScheme === 'dark' ? 'light-content' : 'dark-content'}
        backgroundColor={currentTheme.colors.background}
      />

      <Animated.View style={[styles.content, { opacity: fadeAnim }]}>
        <View style={styles.header}>
          <View style={styles.iconContainer}>
            <Image
              source={require('../assets/shield_icon.png')}
              style={styles.iconImage}
            />
          </View>
          <Text
            style={[styles.title, { color: currentTheme.colors.textPrimary }]}
          >
            ScreenSafe
          </Text>
          <Text
            style={[
              styles.subtitle,
              { color: currentTheme.colors.textSecondary },
            ]}
          >
            AI-Powered Privacy Protection
          </Text>
        </View>

        <View style={styles.actions}>
          <TouchableOpacity
            style={[
              styles.button,
              {
                backgroundColor: currentTheme.colors.primary,
                shadowColor: currentTheme.colors.primary,
              },
            ]}
            onPress={handleCamera}
            activeOpacity={0.8}
          >
            <Text style={[styles.buttonIcon]}>📸</Text>
            <View style={styles.buttonContent}>
              <Text
                style={[
                  styles.buttonTitle,
                  { color: currentTheme.colors.textInverse },
                ]}
              >
                Take Photo
              </Text>
              <Text
                style={[styles.buttonSubtitle, styles.textWhiteTransparent]}
              >
                Scan document or scene
              </Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.button,
              styles.secondaryButton,
              {
                backgroundColor: currentTheme.colors.backgroundSecondary,
                borderColor: currentTheme.colors.border,
              },
            ]}
            onPress={handleGallery}
            activeOpacity={0.8}
          >
            <Text style={[styles.buttonIcon]}>🖼️</Text>
            <View style={styles.buttonContent}>
              <Text
                style={[
                  styles.buttonTitle,
                  { color: currentTheme.colors.textPrimary },
                ]}
              >
                Pick from Gallery
              </Text>
              <Text
                style={[
                  styles.buttonSubtitle,
                  { color: currentTheme.colors.textSecondary },
                ]}
              >
                Import existing images
              </Text>
            </View>
          </TouchableOpacity>
        </View>

        <View
          style={[
            styles.features,
            { backgroundColor: currentTheme.colors.backgroundSecondary },
          ]}
        >
          <Text
            style={[
              styles.featuresTitle,
              { color: currentTheme.colors.textSecondary },
            ]}
          >
            Why ScreenSafe?
          </Text>
          <View style={styles.featureRow}>
            <Text style={styles.featureIcon}>🔒</Text>
            <Text
              style={[
                styles.feature,
                { color: currentTheme.colors.textPrimary },
              ]}
            >
              100% On-Device Processing
            </Text>
          </View>
          <View style={styles.featureRow}>
            <Text style={styles.featureIcon}>💳</Text>
            <Text
              style={[
                styles.feature,
                { color: currentTheme.colors.textPrimary },
              ]}
            >
              Redacts Cards & Sensitive Data
            </Text>
          </View>
          <View style={styles.featureRow}>
            <Text style={styles.featureIcon}>⚡️</Text>
            <Text
              style={[
                styles.feature,
                { color: currentTheme.colors.textPrimary },
              ]}
            >
              Fast & Secure Sharing
            </Text>
          </View>
        </View>
      </Animated.View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    padding: theme.spacing.lg,
  },
  header: {
    alignItems: 'center',
    marginBottom: theme.spacing.xl * 1.5,
  },
  iconContainer: {
    width: 80,
    height: 80,
    borderRadius: 24,
    // backgroundColor: theme.colors.primaryLight,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: theme.spacing.lg,
    ...theme.shadows.lg,
    shadowColor: theme.colors.primary,
  },
  icon: {
    fontSize: 40,
  },
  iconImage: {
    width: 80,
    height: 80,
    resizeMode: 'contain',
  },
  title: {
    fontSize: 36,
    fontWeight: '800',
    marginBottom: theme.spacing.xs,
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 16,
    textAlign: 'center',
    opacity: 0.8,
  },
  actions: {
    gap: theme.spacing.md,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: theme.spacing.lg,
    paddingHorizontal: theme.spacing.lg,
    borderRadius: theme.borderRadius.xl,
    ...theme.shadows.md,
  },
  secondaryButton: {
    borderWidth: 1,
  },
  buttonIcon: {
    fontSize: 24,
    marginRight: theme.spacing.md,
  },
  buttonContent: {
    flex: 1,
  },
  buttonTitle: {
    fontSize: 17,
    fontWeight: '700',
    marginBottom: 2,
  },
  buttonSubtitle: {
    fontSize: 13,
    fontWeight: '500',
  },
  buttonText: {
    fontSize: 18,
    fontWeight: '600',
  },
  features: {
    marginTop: theme.spacing.xl * 1.5,
    padding: theme.spacing.lg,
    borderRadius: theme.borderRadius.xl,
  },
  featuresTitle: {
    fontSize: 13,
    fontWeight: '700',
    marginBottom: theme.spacing.md,
    textTransform: 'uppercase',
    letterSpacing: 1,
    opacity: 0.7,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: theme.spacing.md,
  },
  featureIcon: {
    fontSize: 16,
    marginRight: theme.spacing.sm,
  },
  feature: {
    fontSize: 15,
    fontWeight: '500',
    lineHeight: 20,
  },
  textWhiteTransparent: {
    color: 'rgba(255,255,255,0.8)',
  },
});
