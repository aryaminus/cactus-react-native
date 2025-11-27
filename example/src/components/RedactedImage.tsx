import { useState, forwardRef, useImperativeHandle } from 'react';
import { View, StyleSheet } from 'react-native';
import type { ViewStyle, LayoutChangeEvent } from 'react-native';
import {
  Canvas,
  Image,
  useImage,
  BackdropFilter,
  Blur,
  useCanvasRef,
} from '@shopify/react-native-skia';
import { useTheme } from '../theme';

interface RedactionRegion {
  x: number;
  y: number;
  width: number;
  height: number;
  type: string;
}

interface Props {
  imageUri: string;
  regions: RedactionRegion[];
  enabled: boolean;
  style?: ViewStyle;
}

export interface RedactedImageRef {
  captureRedacted: () => Promise<string | null>;
}

export const RedactedImage = forwardRef<RedactedImageRef, Props>(
  ({ imageUri, regions, enabled, style }, ref) => {
    const image = useImage(imageUri);
    const [layout, setLayout] = useState({ width: 0, height: 0 });
    const theme = useTheme();
    const canvasRef = useCanvasRef();

    useImperativeHandle(ref, () => ({
      captureRedacted: async () => {
        if (!canvasRef.current) {
          console.warn('[RedactedImage] Canvas ref not available');
          return null;
        }

        try {
          // Use the canvas ref's makeImageSnapshotAsync method
          const snapshot = await canvasRef.current.makeImageSnapshotAsync();
          if (!snapshot) {
            console.warn('[RedactedImage] Snapshot returned null');
            return null;
          }

          // Encode to base64
          const base64 = snapshot.encodeToBase64();
          if (!base64) {
            console.warn('[RedactedImage] Base64 encoding failed');
            return null;
          }

          console.log(
            '[RedactedImage] Capture successful, base64 length:',
            base64.length
          );
          return `data:image/png;base64,${base64}`;
        } catch (error) {
          console.error('[RedactedImage] Capture failed:', error);
          return null;
        }
      },
    }));

    const onLayout = (event: LayoutChangeEvent) => {
      setLayout({
        width: event.nativeEvent.layout.width,
        height: event.nativeEvent.layout.height,
      });
    };

    if (!image || layout.width === 0) {
      return (
        <View
          style={[
            style,
            styles.placeholder,
            { backgroundColor: theme.colors.backgroundSecondary },
          ]}
          onLayout={onLayout}
        />
      );
    }

    return (
      <View style={style} onLayout={onLayout}>
        <Canvas ref={canvasRef} style={styles.canvas}>
          <Image
            image={image}
            x={0}
            y={0}
            width={layout.width}
            height={layout.height}
            fit="cover"
          />
          {enabled &&
            regions.map((region, idx) => (
              <BackdropFilter
                key={idx}
                filter={<Blur blur={15} />}
                clip={{
                  x: region.x * layout.width,
                  y: region.y * layout.height,
                  width: region.width * layout.width,
                  height: region.height * layout.height,
                }}
              />
            ))}
        </Canvas>
      </View>
    );
  }
);

const styles = StyleSheet.create({
  placeholder: {
    // Background color handled dynamically
  },
  canvas: {
    flex: 1,
  },
});
