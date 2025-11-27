import React, { useEffect } from 'react';
import { Linking, Platform, DeviceEventEmitter } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { HomeScreen } from './screens/HomeScreen';
import { ScanScreen } from './screens/ScanScreen';
import { useTheme } from './theme';

const Stack = createNativeStackNavigator();

function App(props: any): React.JSX.Element {
  const navigationRef = React.useRef<any>(null);
  const theme = useTheme();

  useEffect(() => {
    // Check for initialProps (Android Cold Start)
    // @ts-ignore - Props are passed from native
    const initialSharedImage = (props as any)?.sharedImageUri;
    if (initialSharedImage && Platform.OS === 'android') {
      console.log('[App] Found initial shared image:', initialSharedImage);
      setTimeout(() => {
        navigationRef.current?.navigate('Scan', {
          imageUri: initialSharedImage.startsWith('content://')
            ? initialSharedImage
            : `file://${initialSharedImage}`,
        });
      }, 500); // Wait for navigation to mount
    }

    // iOS Deep Link Handler (from Share Extension)
    const handleDeepLink = (event: { url: string }) => {
      const url = event.url;
      console.log('[DeepLink] Received:', url);

      if (url.startsWith('screensafe://scan')) {
        // Parse URL parameters
        const params = new URLSearchParams(url.split('?')[1]);
        const imageUri = params.get('image');

        if (imageUri && navigationRef.current) {
          const decodedUri = decodeURIComponent(imageUri);
          console.log('[DeepLink] Navigating to Scan with:', decodedUri);

          // Small delay to ensure navigation is ready
          setTimeout(() => {
            navigationRef.current?.navigate('Scan', {
              imageUri: decodedUri.startsWith('file://')
                ? decodedUri
                : `file://${decodedUri}`,
            });
          }, 100);
        }
      }
    };

    // Android Share Intent Handler (Warm Start)
    const handleAndroidShare = (data: any) => {
      const imageUri = typeof data === 'string' ? data : data?.imageUri;
      console.log('[ShareIntent] Received:', imageUri);

      if (imageUri && navigationRef.current) {
        setTimeout(() => {
          navigationRef.current?.navigate('Scan', {
            imageUri:
              imageUri.startsWith('file://') ||
              imageUri.startsWith('content://')
                ? imageUri
                : `file://${imageUri}`,
          });
        }, 100);
      }
    };

    // Set up iOS linking listener
    const linkingSubscription = Linking.addEventListener('url', handleDeepLink);

    // Check for initial URL (app opened via deep link)
    Linking.getInitialURL().then((url) => {
      if (url) {
        handleDeepLink({ url });
      }
    });

    // Set up Android event listener
    let androidSubscription: any;
    if (Platform.OS === 'android') {
      androidSubscription = DeviceEventEmitter.addListener(
        'onSharedImage',
        handleAndroidShare
      );
    }

    // Cleanup
    return () => {
      linkingSubscription.remove();
      if (androidSubscription) {
        androidSubscription.remove();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <NavigationContainer ref={navigationRef}>
      <Stack.Navigator
        initialRouteName="Home"
        screenOptions={{
          headerStyle: {
            backgroundColor: theme.colors.primary,
          },
          headerTintColor: theme.colors.textInverse,
          headerTitleStyle: {
            fontWeight: theme.typography.fontWeight.bold,
            fontSize: theme.typography.fontSize.lg,
          },
          headerShadowVisible: true,
          animation: 'slide_from_right',
        }}
      >
        <Stack.Screen
          name="Home"
          component={HomeScreen}
          options={{ title: 'ScreenSafe' }}
        />
        <Stack.Screen
          name="Scan"
          component={ScanScreen}
          options={{ title: 'Scanning...' }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}

export default App;
