import React, { useEffect, useState, useRef, useLayoutEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  ActivityIndicator,
  StyleSheet,
  TouchableOpacity,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Animated,
  Modal,
  Switch,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCactusLM } from 'cactus-react-native';
import ImageResizer from '@bam.tech/react-native-image-resizer';
import Share from 'react-native-share';
import { ImageRedactor } from '../services/ImageRedactor';
import {
  RedactedImage,
  type RedactedImageRef,
} from '../components/RedactedImage';
import type { PIIResult } from '../services/PIIDetector';
import type { FeedMessage, MessageQueue } from '../services/FeedMessage';
import { theme, useTheme } from '../theme';
import { createShimmerAnimation } from '../animations';
import {
  lightHaptic,
  successHaptic,
  errorHaptic,
  warningHaptic,
} from '../haptics';
import { HybridInference } from '../services/HybridInference';
import { SettingsService, type AppSettings } from '../services/SettingsService';

const redactor = new ImageRedactor();

type Props = NativeStackScreenProps<any, 'Scan'>;

export const ScanScreen = ({ route, navigation }: Props) => {
  const { imageUri, batchImages } = route.params || {};

  // Get current theme (light or dark)
  const currentTheme = useTheme();

  // Multi-image support
  const allImages = React.useMemo(
    () => batchImages || [imageUri],
    [batchImages, imageUri]
  );
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const currentImage = allImages[currentImageIndex];

  // Per-image scan results storage
  const [scanResults, setScanResults] = useState<
    Map<
      string,
      {
        messages: FeedMessage[];
        redactionRegions: any[];
        piiResult?: PIIResult;
      }
    >
  >(new Map());

  // Feed-based state (current image)
  const [messages, setMessages] = useState<FeedMessage[]>([]);
  const [messageQueue, setMessageQueue] = useState<MessageQueue>({
    pending: [],
    current: null,
  });
  const [chatInput, setChatInput] = useState('');
  const flatListRef = useRef<FlatList>(null);
  const redactedImageRef = useRef<RedactedImageRef>(null);

  // Redaction state (current image)
  const [showRedaction, setShowRedaction] = useState(false);
  const [redactionRegions, setRedactionRegions] = useState<any[]>([]);

  // Batch scanning state
  const [scanningQueue, setScanningQueue] = useState<string[]>([]);
  const [scannedImages, setScannedImages] = useState<Set<string>>(new Set());
  const [isAutoScanning, setIsAutoScanning] = useState(false);

  // Dynamic resolution based on device capability
  const [imageResolution, setImageResolution] = useState(512);

  // Models
  const visionLM = useCactusLM({ model: 'lfm2-vl-450m' });
  const textLM = useCactusLM({ model: 'qwen3-0.6' });

  // Settings
  const [settings, setSettings] = useState<AppSettings>({
    cloudProvider: 'openai',
    cloudModel: 'gpt-4o-mini',
    cloudApiKey: '',
    cloudBaseUrl: 'https://dspy-proxy.onrender.com',
    allowCloud: false,
  });
  const [showSettings, setShowSettings] = useState(false);
  const [settingsLoaded, setSettingsLoaded] = useState(false);

  // Hybrid Inference
  const hybridInferenceRef = useRef<HybridInference | null>(null);

  // Scan lock to prevent race conditions
  const isScanningRef = useRef(false);
  const scannedImagesRef = useRef(new Set<string>());

  // Ref to track current image for async operations
  const currentImageRef = useRef(currentImage);
  useEffect(() => {
    currentImageRef.current = currentImage;
  }, [currentImage]);

  // Ref to always get latest settings to avoid closure issues
  const settingsRef = useRef(settings);
  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  // Sync scannedImages ref with state
  useEffect(() => {
    scannedImagesRef.current = scannedImages;
  }, [scannedImages]);

  // Update header with scan progress

  // Check device capability and adjust resolution
  const checkDeviceMemory = async () => {
    try {
      // Use Platform constants for device detection (no extra dependencies needed)
      const isLowEndDevice = Platform.OS === 'android' && Platform.Version < 28; // Android < 9.0
      const isVeryOldDevice =
        Platform.OS === 'android' && Platform.Version < 24; // Android < 7.0

      // iOS heuristics - older devices typically have less RAM
      const isOldIOS =
        Platform.OS === 'ios' && parseFloat(Platform.Version as string) < 14.0;

      if (isVeryOldDevice) {
        setImageResolution(256);
        console.log(
          '[ScanScreen] Very old device detected (Android < 7), using 256px resolution'
        );
      } else if (isLowEndDevice || isOldIOS) {
        setImageResolution(384);
        console.log(
          '[ScanScreen] Low-end device detected, using 384px resolution'
        );
      } else {
        setImageResolution(512);
        console.log(
          '[ScanScreen] Modern device detected, using optimal 512px resolution'
        );
      }
    } catch (error) {
      console.warn(
        '[ScanScreen] Device detection failed, using conservative 384px'
      );
      setImageResolution(384); // Conservative default on error
    }
  };

  // Load settings
  useEffect(() => {
    SettingsService.loadSettings().then((loadedSettings) => {
      setSettings(loadedSettings);
      setSettingsLoaded(true);
      console.log('[ScanScreen] Settings loaded:', {
        allowCloud: loadedSettings.allowCloud,
        hasApiKey: !!loadedSettings.cloudApiKey,
      });
    });
  }, []);

  // Detect device memory and adjust resolution (run once)
  useEffect(() => {
    checkDeviceMemory();
  }, []);

  // Initialize HybridInference
  useEffect(() => {
    if (textLM && !hybridInferenceRef.current) {
      hybridInferenceRef.current = new HybridInference(textLM);
    }
  }, [textLM]);

  // Helper: Add message to feed
  const addMessage = (message: Omit<FeedMessage, 'id' | 'timestamp'>) => {
    const newMsg: FeedMessage = {
      ...message,
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`, // Unique ID
      timestamp: new Date(),
    };
    setMessages((prev) => [newMsg, ...prev]); // Newest first

    // Smooth scroll to top when new message added
    setTimeout(() => {
      flatListRef.current?.scrollToOffset({ offset: 0, animated: true });
    }, 100);

    return newMsg.id;
  };

  // Helper: Update message by ID
  const updateMessage = (id: string, updates: Partial<FeedMessage>) => {
    setMessages((prev) =>
      prev.map((msg) => (msg.id === id ? { ...msg, ...updates } : msg))
    );
  };

  // Process queued messages when model is free
  useEffect(() => {
    const isModelBusy = visionLM.isGenerating || textLM.isGenerating;

    if (!isModelBusy && messageQueue.pending.length > 0) {
      // Process next message in queue
      const nextMessage = messageQueue.pending[0];
      if (nextMessage) {
        setMessageQueue((prev) => ({
          ...prev,
          pending: prev.pending.slice(1),
          current: nextMessage,
        }));

        // Process the message
        if (nextMessage.type === 'user') {
          processUserMessage(nextMessage.content);
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visionLM.isGenerating, textLM.isGenerating, messageQueue.pending.length]);

  // Auto-download models
  useEffect(() => {
    if (!visionLM.isDownloaded) visionLM.download();
    if (!textLM.isDownloaded) textLM.download();
  }, [visionLM.isDownloaded, textLM.isDownloaded, visionLM, textLM]);

  // Scan a specific image and save results
  const performScanForImage = React.useCallback(
    async (targetUri: string, retryCount: number = 0) => {
      const MAX_RETRIES = 2;

      try {
        // Always use latest settings from ref to avoid stale closure issues
        const latestSettings = settingsRef.current;

        // If settings are not loaded and this is not a retry, wait for settings
        if (
          !settingsLoaded &&
          retryCount === 0 &&
          !latestSettings.allowCloud &&
          !latestSettings.cloudApiKey
        ) {
          console.log('[Scan] Settings not ready, delaying scan...', {
            settingsLoaded,
            hasSettings: !!latestSettings.allowCloud,
          });
          // Wait a bit for settings to load
          setTimeout(() => performScanForImage(targetUri, retryCount), 500);
          return;
        }

        const currentSettings = latestSettings; // Always use ref value

        console.log('[Scan] Using settings:', {
          settingsLoaded,
          allowCloud: currentSettings.allowCloud,
          hasApiKey: !!currentSettings.cloudApiKey,
          imageUri: targetUri,
          refSettingsAllowCloud: latestSettings.allowCloud,
          stateSettingsAllowCloud: settings.allowCloud,
        });

        // Prevent concurrent scans - check both ref AND model state
        if (
          (isScanningRef.current ||
            visionLM.isGenerating ||
            textLM.isGenerating) &&
          retryCount === 0
        ) {
          console.log('[Scan] Scan already in progress, skipping:', targetUri);
          return;
        }

        // Prevent re-scanning already scanned images (unless retrying)
        if (scannedImagesRef.current.has(targetUri) && retryCount === 0) {
          console.log('[Scan] Image already scanned, skipping:', targetUri);
          return;
        }

        // Skip if already scanned (unless retrying)
        if (scannedImages.has(targetUri) && retryCount === 0) {
          console.log('[Scan] Already scanned, skipping:', targetUri);
          return;
        }

        if (retryCount === 0) isScanningRef.current = true;

        // Set initial "Analyzing" state immediately to prevent UI flicker/clearing
        const initMsg: FeedMessage = {
          id: `init-${Date.now()}`,
          type: 'system',
          content: '🔍 Analyzing image...',
          status: 'processing',
          timestamp: new Date(),
        };

        setScanResults((prev) => {
          const newMap = new Map(prev);
          if (!newMap.has(targetUri)) {
            newMap.set(targetUri, {
              messages: [initMsg],
              redactionRegions: [],
            });
          }
          return newMap;
        });

        // Update UI if current image
        if (targetUri === currentImageRef.current) {
          setMessages((prev) => (prev.length === 0 ? [initMsg] : prev));
        }

        console.log(
          `[Scan] Starting scan for image (attempt ${retryCount + 1}/${MAX_RETRIES + 1}):`,
          targetUri
        );
        console.log('[Scan] Settings:', {
          allowCloud: currentSettings.allowCloud,
          hasKey: !!currentSettings.cloudApiKey,
        });

        // Check if models are ready
        if (!visionLM.isDownloaded || !textLM.isDownloaded) {
          throw new Error(
            'Models not downloaded yet. Please wait for models to finish downloading.'
          );
        }

        const resized = await ImageResizer.createResizedImage(
          targetUri,
          imageResolution,
          imageResolution,
          'JPEG',
          90
        );

        // Stage 1: Description
        const describePrompt = `You are an expert document analyzer. Analyze this image thoroughly:

1. IDENTIFY: What type of item is this?
   - Document type: ID card, credit card, passport, Social Security card, driver's license, government letter, receipt
   - Scene type: photo, screenshot, nature, object

2. TRANSCRIBE ALL TEXT: Read every visible character exactly as written:
   - Headers, titles, labels (e.g., "Social Security", "Driver License", "VISA")
   - Numbers, especially formatted patterns (XXX-XX-XXXX, XXXX-XXXX-XXXX-XXXX)
   - Names, addresses, dates, phone numbers, emails
   - Logos, organization names, official seals
   - Include OCR artifacts (misspellings, partial text)

3. DETECT VISUAL PII:
   - Human faces or people
   - Signatures or handwriting
   - Barcodes, QR codes, magnetic strips
   - Government or official emblems

4. DESCRIBE: Provide factual description of the scene

Be precise and exhaustive. Report exactly what you see, not what you infer.
If this is a nature photo or object without any personal information, state that clearly.`;

        let descriptionResult;
        try {
          descriptionResult = await visionLM.complete({
            messages: [
              {
                role: 'user',
                content: describePrompt,
                images: [resized.uri.replace('file://', '')],
              },
            ],
          });
        } catch (visionError) {
          console.error('[Scan] Vision model error:', visionError);

          // Check if it's a C++ runtime error
          const errorMsg =
            visionError instanceof Error
              ? visionError.message
              : String(visionError);
          if (
            errorMsg.includes('std::runtime_error') ||
            errorMsg.includes('Unknown')
          ) {
            if (retryCount < MAX_RETRIES) {
              console.log(
                `[Scan] Retrying after native module error (${retryCount + 1}/${MAX_RETRIES})...`
              );
              await new Promise((resolve) => setTimeout(resolve, 1000)); // Wait 1 second
              return performScanForImage(targetUri, retryCount + 1);
            }
            throw new Error(
              'Vision model failed. Try restarting the app or re-downloading models.'
            );
          }
          throw visionError;
        }

        let description = descriptionResult.response
          .replace(/<\|.*?\|>/g, '')
          .replace(/^(Sure,?\s*here'?s?\s*(the\s*)?description:?\s*)/i, '')
          .replace(/^(Here'?s?\s*what\s*I\s*see:?\s*)/i, '')
          .replace(/!\[Image\]\([^)]+\)/g, '')
          .replace(/https?:\/\/[^\s]+/g, '')
          .trim();

        // IMMEDIATE UPDATE: Show description
        const descMessage: FeedMessage = {
          id: `desc-${Date.now()}`,
          type: 'system',
          content: `📝 Description: ${description}`,
          status: 'complete',
          timestamp: new Date(),
        };

        // Save intermediate result
        setScanResults((prev) => {
          const newMap = new Map(prev);
          const existing = newMap.get(targetUri);
          newMap.set(targetUri, {
            messages: existing
              ? [...existing.messages, descMessage]
              : [descMessage],
            redactionRegions: existing?.redactionRegions || [],
            piiResult: existing?.piiResult,
          });
          return newMap;
        });

        // Update UI if current image
        if (targetUri === currentImageRef.current) {
          setMessages((prev) => [...prev, descMessage]);
        }

        // Stage 2: PII Analysis
        let piiResult: PIIResult;

        try {
          if (!hybridInferenceRef.current)
            throw new Error('Inference engine not initialized');

          console.log('[Scan] Settings before analysis:', {
            allowCloud: currentSettings.allowCloud,
            hasApiKey: !!currentSettings.cloudApiKey,
            provider: currentSettings.cloudProvider,
            model: currentSettings.cloudModel,
          });

          if (currentSettings.allowCloud) {
            await hybridInferenceRef.current.setCloudConfig({
              provider: currentSettings.cloudProvider,
              model: currentSettings.cloudModel,
              apiKey: currentSettings.cloudApiKey,
              baseUrl: currentSettings.cloudBaseUrl,
            });
          }

          piiResult = await hybridInferenceRef.current.analyze(
            description,
            currentSettings.allowCloud
          );
        } catch (textError) {
          console.error('[Scan] Text/Hybrid model error:', textError);

          // Check if it's a C++ runtime error
          const errorMsg =
            textError instanceof Error ? textError.message : String(textError);
          if (
            errorMsg.includes('std::runtime_error') ||
            errorMsg.includes('Unknown')
          ) {
            if (retryCount < MAX_RETRIES) {
              console.log(
                `[Scan] Retrying after native module error (${retryCount + 1}/${MAX_RETRIES})...`
              );
              await new Promise((resolve) => setTimeout(resolve, 1000)); // Wait 1 second
              return performScanForImage(targetUri, retryCount + 1);
            }
            throw new Error(
              'Text model failed. Try restarting the app or re-downloading models.'
            );
          }
          throw textError;
        }

        // Create PII result message
        let resultContent = piiResult.hasPII
          ? `⚠️ Found ${piiResult.count} PII item(s)`
          : '✅ No PII detected';

        // Add cloud failure notice if applicable
        if (currentSettings.allowCloud && piiResult.confidence !== 'high') {
          resultContent += ' (Local analysis only - cloud unavailable)';
        }

        const piiMessage: FeedMessage = {
          id: `result-${Date.now()}`,
          type: 'pii-result',
          content: resultContent,
          status: 'complete',
          timestamp: new Date(),
          piiResult,
        };

        // Generate redaction regions if needed
        const regions = piiResult.hasPII
          ? redactor.getRedactionRegions(piiResult.types)
          : [];

        let redactMessage: FeedMessage | undefined;
        if (piiResult.hasPII) {
          redactMessage = {
            id: `redact-${Date.now()}`,
            type: 'system',
            content: `🛡️ Redacted ${piiResult.count} item(s)`,
            status: 'complete',
            timestamp: new Date(),
          };
        }

        // Save final result
        setScanResults((prev) => {
          const newMap = new Map(prev);
          const existing = newMap.get(targetUri);
          // Filter out any previous result messages to avoid duplicates if re-scanning
          const prevMessages = existing
            ? existing.messages.filter((m) => m.type !== 'pii-result')
            : [];

          // Update initial processing message to complete status
          const updatedPrevMessages = prevMessages.map((m) =>
            m.id.startsWith('init-') && m.status === 'processing'
              ? {
                  ...m,
                  status: 'complete' as const,
                  content: '✅ Analysis complete',
                }
              : m
          );

          newMap.set(targetUri, {
            messages: redactMessage
              ? [...updatedPrevMessages, piiMessage, redactMessage]
              : [...updatedPrevMessages, piiMessage],
            redactionRegions: regions,
            piiResult,
          });
          return newMap;
        });

        // Mark as scanned
        setScannedImages((prev) => new Set(prev).add(targetUri));

        // If this is the current image, update UI
        if (targetUri === currentImageRef.current) {
          setMessages((prev) => {
            const filtered = prev.filter((m) => m.type !== 'pii-result');
            // Update initial processing message to complete status
            const updatedMessages = filtered.map((m) =>
              m.id.startsWith('init-') && m.status === 'processing'
                ? {
                    ...m,
                    status: 'complete' as const,
                    content: '✅ Analysis complete',
                  }
                : m
            );
            return redactMessage
              ? [...updatedMessages, piiMessage, redactMessage]
              : [...updatedMessages, piiMessage];
          });
          setRedactionRegions(regions);
          setShowRedaction(regions.length > 0);

          // Haptic feedback
          if (piiResult.hasPII) {
            warningHaptic();
          } else {
            successHaptic();
          }
        }

        // Remove from scanning queue
        setScanningQueue((prev) => prev.filter((img) => img !== targetUri));

        // Small delay before marking as not scanning to prevent race conditions
        await new Promise((resolve) => setTimeout(resolve, 100));

        console.log('[Scan] Scan completed successfully');
      } catch (error) {
        console.error('[Scan] Error scanning image:', error);

        // Create user-friendly error message
        let errorMessage = 'Unknown error occurred';
        if (error instanceof Error) {
          if (error.message.includes('Models not downloaded')) {
            errorMessage = 'Please wait for AI models to finish downloading';
          } else if (
            error.message.includes('Vision model failed') ||
            error.message.includes('Text model failed')
          ) {
            errorMessage = error.message;
          } else if (
            error.message.includes('std::runtime_error') ||
            error.message.includes('Unknown')
          ) {
            errorMessage = 'AI model error. Try restarting the app.';
          } else {
            errorMessage = error.message;
          }
        }

        // Show error in UI if this is the current image
        if (targetUri === currentImageRef.current) {
          setMessages([
            {
              id: `error-${Date.now()}`,
              type: 'system',
              content: `❌ Scan failed: ${errorMessage}`,
              status: 'error',
              timestamp: new Date(),
              error: errorMessage,
            },
          ]);
          errorHaptic();
        }

        // Remove from scanning queue
        setScanningQueue((prev) => prev.filter((img) => img !== targetUri));
      } finally {
        if (retryCount === 0) isScanningRef.current = false;
      }
    },
    [settings, settingsLoaded, visionLM, textLM, scannedImages, imageResolution]
  );

  // Progressive scan with feed updates
  const performScan = async () => {
    // Reuse performScanForImage for the current image
    return performScanForImage(currentImage);
  };

  // Initialize auto-scan queue for batch images
  useEffect(() => {
    if (
      visionLM.isDownloaded &&
      textLM.isDownloaded &&
      settingsLoaded &&
      scanningQueue.length === 0
    ) {
      if (allImages.length > 1) {
        // Batch: Start auto-scanning all images
        setScanningQueue([...allImages]);
        setIsAutoScanning(true);
      } else if (allImages.length === 1 && !scannedImages.has(currentImage)) {
        // Single image: Scan immediately if not already scanned
        performScanForImage(currentImage);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visionLM.isDownloaded, textLM.isDownloaded, settingsLoaded]);

  const [processingImage, setProcessingImage] = useState<string | null>(null);

  // Process auto-scan queue
  useEffect(() => {
    if (
      !processingImage &&
      !visionLM.isGenerating &&
      !textLM.isGenerating &&
      scanningQueue.length > 0 &&
      isAutoScanning
    ) {
      const nextImage = scanningQueue[0];
      if (!nextImage) return;

      if (scannedImages.has(nextImage)) {
        // Already scanned, remove and continue
        setScanningQueue((prev) => prev.slice(1));
        return;
      }

      // Lock and scan
      setProcessingImage(nextImage);

      // Auto-scroll to image being scanned
      const nextIndex = allImages.indexOf(nextImage);
      if (nextIndex !== -1) {
        setCurrentImageIndex(nextIndex);
      }

      performScanForImage(nextImage)
        .catch((err) => {
          console.error('[AutoScan] Failed to scan image:', nextImage, err);
        })
        .finally(async () => {
          // Add a small delay to let the user see the result
          await new Promise((resolve) => setTimeout(resolve, 1500));

          setProcessingImage(null);
          setScanningQueue((prev) => prev.filter((img) => img !== nextImage));
        });
    }

    // Stop auto-scanning when queue is empty
    if (scanningQueue.length === 0 && isAutoScanning && !processingImage) {
      setIsAutoScanning(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    visionLM.isGenerating,
    textLM.isGenerating,
    scanningQueue,
    isAutoScanning,
    processingImage,
    performScanForImage,
  ]);

  // Load scan results when switching images
  useEffect(() => {
    // console.log('[ScanScreen] Image changed:', currentImageIndex, currentImage);
    const savedResult = scanResults.get(currentImage);
    if (savedResult) {
      // Restore saved scan results
      // console.log('[ScanScreen] Restoring saved results');
      setMessages(savedResult.messages);
      setRedactionRegions(savedResult.redactionRegions);
      setShowRedaction(savedResult.redactionRegions.length > 0);
    } else {
      // No saved results, clear state
      // console.log('[ScanScreen] No saved results, clearing state');
      setMessages([]);
      setRedactionRegions([]);
      setShowRedaction(false);

      // If models are ready and settings are loaded and not auto-scanning and not already scanned, scan this image
      if (
        visionLM.isDownloaded &&
        textLM.isDownloaded &&
        settingsLoaded &&
        !isAutoScanning &&
        !scannedImages.has(currentImage)
      ) {
        console.log('[ScanScreen] Models and settings ready, starting scan');
        performScanForImage(currentImage);
      } else {
        console.log(
          '[ScanScreen] Waiting for models/settings or already scanned...',
          {
            modelsReady: visionLM.isDownloaded && textLM.isDownloaded,
            settingsLoaded,
            isAutoScanning,
            alreadyScanned: scannedImages.has(currentImage),
          }
        );
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    currentImageIndex,
    visionLM.isDownloaded,
    textLM.isDownloaded,
    settingsLoaded,
    scannedImages,
  ]);

  // Share all safe images or redacted versions
  const handleShareAll = async () => {
    // Special case: Single image with PII - use individual share instead
    if (allImages.length === 1) {
      const result = scanResults.get(allImages[0]);
      const hasPII = result?.piiResult?.hasPII;
      const isHighConfidence = result?.piiResult?.confidence === 'high';

      if (hasPII && isHighConfidence && result?.redactionRegions?.length > 0) {
        // Single image with redaction - call handleShare directly
        return handleShare();
      }
    }

    const imagesToShare: string[] = [];
    let hasRedacted = false;

    // Process each image
    for (const img of allImages) {
      const result = scanResults.get(img);
      const hasPII = result?.piiResult?.hasPII;
      const isHighConfidence = result?.piiResult?.confidence === 'high';

      if (!hasPII) {
        // Safe to share original
        imagesToShare.push(img);
      } else if (isHighConfidence && result?.redactionRegions?.length > 0) {
        // Can share redacted version (skip for now - multi-image redaction needs batch capture)
        // For MVP, we only share safe images in bulk
        hasRedacted = true;
      }
    }

    if (imagesToShare.length === 0) {
      // Only show alert for multiple images
      if (allImages.length > 1) {
        if (hasRedacted) {
          Alert.alert(
            'Share Individual Images',
            'Images with PII can be shared individually with redaction applied. Please share them one at a time.'
          );
        } else {
          Alert.alert(
            'No Safe Images',
            'All images contain PII. Share them individually to apply redaction.'
          );
        }
      }
      return;
    }

    try {
      const message = hasRedacted
        ? `✅ ${imagesToShare.length} safe image(s) verified by ScreenSafe. Note: ${allImages.length - imagesToShare.length} image(s) with PII excluded.`
        : `✅ ${imagesToShare.length} image(s) verified safe by ScreenSafe - No PII detected!`;

      await Share.open({
        urls: imagesToShare.map((uri: string) =>
          uri.startsWith('file://') ? uri : `file://${uri}`
        ),
        message,
      });
    } catch (error) {
      if (
        error &&
        typeof error === 'object' &&
        'message' in error &&
        error.message !== 'User did not share'
      ) {
        Alert.alert('Share Error', 'Could not share images');
      }
    }
  };

  // Retry scanning all images
  const handleRetryAll = React.useCallback(() => {
    setScanningQueue([...allImages]);
    setScannedImages(new Set());
    setScanResults(new Map());
    setIsAutoScanning(true);
  }, [allImages]);

  // Header configuration
  const renderHeaderRight = React.useCallback(
    () => (
      <View style={styles.headerRightContainer}>
        {scannedImages.size < allImages.length &&
          !isAutoScanning &&
          allImages.length > 1 && (
            <TouchableOpacity
              onPress={() => {
                lightHaptic();
                handleRetryAll();
              }}
              style={styles.headerRetryButton}
            >
              <Text
                style={[
                  styles.headerRetryText,
                  { color: currentTheme.colors.textInverse },
                ]}
              >
                ↻ Scan All
              </Text>
            </TouchableOpacity>
          )}
        <TouchableOpacity
          onPress={() => {
            lightHaptic();
            setShowSettings(true);
          }}
          style={styles.headerButton}
        >
          <Text
            style={[
              styles.headerButtonText,
              { color: currentTheme.colors.textInverse },
            ]}
          >
            ⚙️
          </Text>
        </TouchableOpacity>
      </View>
    ),
    [
      scannedImages.size,
      allImages.length,
      isAutoScanning,
      handleRetryAll,
      currentTheme.colors.textInverse,
    ]
  );

  useLayoutEffect(() => {
    const scannedCount = scannedImages.size;
    const totalCount = allImages.length;

    navigation.setOptions({
      title:
        allImages.length > 1
          ? `Scanned ${scannedCount}/${totalCount}`
          : scannedCount > 0
            ? 'Scanned'
            : 'Scanning...',
      headerRight: renderHeaderRight,
    });
  }, [scannedImages.size, allImages.length, navigation, renderHeaderRight]);

  // Retry current image
  const handleRetryCurrent = () => {
    const currentImageUri = currentImage;
    setScanResults((prev) => {
      const newMap = new Map(prev);
      newMap.delete(currentImageUri);
      return newMap;
    });
    setScannedImages((prev) => {
      const newSet = new Set(prev);
      newSet.delete(currentImageUri);
      return newSet;
    });
    setMessages([]);
    setRedactionRegions([]);
    setShowRedaction(false);
    // Trigger scan
    performScanForImage(currentImageUri);
  };

  // Handle chat input
  const handleSendMessage = async () => {
    if (!chatInput.trim()) return;

    const isModelBusy = visionLM.isGenerating || textLM.isGenerating;
    const userMessage = chatInput.trim();
    setChatInput('');

    // Add user message
    const userMsgId = addMessage({
      type: 'user',
      content: userMessage,
      status: 'complete',
      isEditable: true,
    });

    if (isModelBusy) {
      // Queue it
      setMessageQueue((prev) => ({
        ...prev,
        pending: [
          ...prev.pending,
          {
            id: userMsgId,
            type: 'user',
            content: userMessage,
            timestamp: new Date(),
            status: 'sending',
          },
        ],
      }));
      addMessage({
        type: 'system',
        content: `⏳ Message queued (${messageQueue.pending.length + 1} pending)`,
        status: 'complete',
      });
      return;
    }

    // Process immediately
    await processUserMessage(userMessage);
  };

  // Determine if question requires visual analysis
  const isVisualQuestion = (question: string): boolean => {
    const lowerQ = question.toLowerCase();
    const visualKeywords = [
      'color',
      'colour',
      'what does',
      'show me',
      'where is',
      'what is visible',
      'can you see',
      'is there',
      'how many',
      'what type',
      'identify',
      'looks like',
      'appears',
      'visible',
      'shown',
      'displayed',
    ];
    return visualKeywords.some((keyword) => lowerQ.includes(keyword));
  };

  // Process user message with hybrid approach (vision for visual, text for analytical)
  const processUserMessage = async (message: string) => {
    const aiMsgId = addMessage({
      type: 'system',
      content: '💭 AI is thinking...',
      status: 'processing',
    });

    try {
      // Extract existing description from messages to provide context
      const descriptionMsg = messages.find(
        (m) => m.type === 'system' && m.content.includes('Description:')
      );
      const existingDescription =
        descriptionMsg?.content.replace('📝 Description: ', '') || '';

      // Get PII analysis result for additional context
      const piiMsg = messages.find((m) => m.type === 'pii-result');
      const piiContext = piiMsg?.piiResult
        ? `PII Status: ${piiMsg.piiResult.hasPII ? `Found ${piiMsg.piiResult.count} items (${piiMsg.piiResult.types.join(', ')})` : 'None detected'}`
        : '';

      let response;

      // HYBRID APPROACH: Visual questions use vision model, analytical use text model
      if (isVisualQuestion(message)) {
        console.log('[Chat] Visual question detected, using vision model');
        // Use vision model for visual questions
        const resized = await ImageResizer.createResizedImage(
          currentImage,
          imageResolution,
          imageResolution,
          'JPEG',
          90
        );

        response = await visionLM.complete({
          messages: [
            {
              role: 'system',
              content:
                'You are a privacy assistant. Answer visual questions about the image briefly and accurately.',
            },
            {
              role: 'user',
              content: message,
              images: [resized.uri.replace('file://', '')],
            },
          ],
        });
      } else {
        console.log(
          '[Chat] Analytical question detected, using text model with context'
        );
        // Use text model with context for analytical/follow-up questions
        const contextPrompt = existingDescription
          ? `Image Analysis Context:
${existingDescription}

${piiContext}

User Question: ${message}

Answer briefly and helpfully based on the image analysis above.`
          : message;

        response = await textLM.complete({
          messages: [
            {
              role: 'system',
              content:
                'You are a privacy assistant. Answer questions based on the provided image analysis context.',
            },
            { role: 'user', content: contextPrompt },
          ],
        });
      }

      const cleanResponse = response.response.replace(/<\|.*?\|>/g, '').trim();

      updateMessage(aiMsgId, {
        content: cleanResponse,
        status: 'complete',
      });
    } catch (error) {
      updateMessage(aiMsgId, {
        content: `❌ Error: ${error instanceof Error ? error.message : 'Failed to respond'}`,
        status: 'error',
        error: error instanceof Error ? error.message : undefined,
      });
    }
  };

  // Handle share image
  const handleShare = async () => {
    try {
      const result = scanResults.get(currentImage);
      const hasPII = result?.piiResult?.hasPII;
      const isHighConfidence = result?.piiResult?.confidence === 'high';

      let imageToShare = currentImage;
      let message = '✅ Verified safe by ScreenSafe - No PII detected!';

      // If high confidence PII detected, share redacted version
      if (hasPII && isHighConfidence && redactionRegions.length > 0) {
        try {
          // Capture redacted image
          const redactedUri = await redactedImageRef.current?.captureRedacted();
          if (redactedUri) {
            imageToShare = redactedUri;
            message =
              '🛡️ Redacted by ScreenSafe - PII removed for your safety!';
          } else {
            Alert.alert(
              'Redaction Error',
              'Could not capture redacted image. Please try again.'
            );
            return;
          }
        } catch (captureError) {
          console.error('[Share] Redaction capture failed:', captureError);
          Alert.alert('Redaction Error', 'Could not create redacted version.');
          return;
        }
      }

      await Share.open({
        urls: [
          imageToShare.startsWith('file://')
            ? imageToShare
            : imageToShare.startsWith('data:')
              ? imageToShare
              : `file://${imageToShare}`,
        ],
        message,
      });
    } catch (error) {
      // User cancelled or error occurred
      if (
        error &&
        typeof error === 'object' &&
        'message' in error &&
        error.message !== 'User did not share'
      ) {
        Alert.alert('Share Error', 'Could not share image');
      }
    }
  };

  // Navigate between images
  const handlePreviousImage = () => {
    if (currentImageIndex > 0) {
      setCurrentImageIndex(currentImageIndex - 1);
    }
  };

  const handleNextImage = () => {
    if (currentImageIndex < allImages.length - 1) {
      const nextIndex = currentImageIndex + 1;
      const nextImage = allImages[nextIndex];
      if (!nextImage) return;
      setCurrentImageIndex(nextIndex);
    }
  };

  // Handle edit message
  const handleEditMessage = (messageId: string, content: string) => {
    setChatInput(content);
    // Remove the message and any responses (newer messages)
    // Inverted list: 0 is newest, length-1 is oldest
    setMessages((prev) => {
      const index = prev.findIndex((m) => m.id === messageId);
      if (index === -1) return prev;

      // Keep messages OLDER than the edited message (higher index)
      return prev.filter((_, idx) => idx > index);
    });
  };

  // ... (rest of file)

  // Handle retry user message (resend same message)
  const handleRetryUserMessage = async (content: string) => {
    setChatInput('');
    await processUserMessage(content);
  };

  // Handle retry message
  const handleRetryMessage = async (messageId: string) => {
    const message = messages.find((m) => m.id === messageId);
    if (!message) return;

    // Find the user message that triggered this
    const messageIndex = messages.findIndex((m) => m.id === messageId);
    let userMessage = '';

    // Look backwards for user message
    for (let i = messageIndex + 1; i < messages.length; i++) {
      const msg = messages[i];
      if (msg?.type === 'user') {
        userMessage = msg.content;
        break;
      }
    }

    if (!userMessage) {
      // If no user message, it's a scan retry
      await performScan();
    } else {
      // Remove failed message and retry
      setMessages((prev) => prev.filter((m) => m.id !== messageId));
      await processUserMessage(userMessage);
    }
  };

  // Render message card
  const renderMessage = ({ item }: { item: FeedMessage }) => {
    if (item.type === 'user') {
      return (
        <View style={styles.userMessageContainer}>
          <View style={styles.userBubble}>
            <Text style={styles.userText}>{item.content}</Text>
          </View>
          <View style={styles.messageActions}>
            {item.isEditable && (
              <>
                <TouchableOpacity
                  style={styles.messageActionButton}
                  onPress={() => handleEditMessage(item.id, item.content)}
                >
                  <Text style={styles.actionButtonText}>✏️ Edit</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.messageActionButton}
                  onPress={() => handleRetryUserMessage(item.content)}
                >
                  <Text style={styles.actionButtonText}>↻ Retry</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      );
    }

    if (item.type === 'stage1') {
      return (
        <View
          style={[
            styles.stage1Container,
            {
              backgroundColor: currentTheme.colors.infoLight,
              borderColor: currentTheme.colors.info,
            },
          ]}
        >
          <Text
            style={[
              styles.stage1Title,
              { color: currentTheme.colors.textPrimary },
            ]}
          >
            🔍 Security Analysis
          </Text>
          <View
            style={[
              styles.stage1Box,
              { backgroundColor: currentTheme.colors.background },
            ]}
          >
            <Text
              style={[
                styles.stage1Text,
                { color: currentTheme.colors.textPrimary },
              ]}
            >
              {item.content}
            </Text>
          </View>
        </View>
      );
    }

    if (item.type === 'pii-result' && item.piiResult) {
      const { piiResult } = item;
      return (
        <View
          style={[
            piiResult.hasPII ? styles.warningCard : styles.safeCard,
            piiResult.hasPII
              ? {
                  backgroundColor: currentTheme.colors.errorLight,
                  borderColor: currentTheme.colors.error,
                }
              : {
                  backgroundColor: currentTheme.colors.successLight,
                  borderColor: currentTheme.colors.success,
                },
          ]}
        >
          {piiResult.hasPII ? (
            <>
              <Text style={styles.warningIcon}>⚠️</Text>
              <Text
                style={[
                  styles.warningTitle,
                  { color: currentTheme.colors.error },
                ]}
              >
                Sensitive Data Found!
              </Text>
              <Text
                style={[
                  styles.warningSubtitle,
                  { color: currentTheme.colors.textSecondary },
                ]}
              >
                Detected {piiResult.count} item(s):
              </Text>
              {piiResult.types.map((type, idx) => (
                <View key={idx} style={[styles.piiItem, styles.piiItemRed]}>
                  <Text
                    style={[
                      styles.piiText,
                      { color: currentTheme.colors.error },
                    ]}
                  >
                    • {redactor.getRedactionSummary([type])}
                  </Text>
                </View>
              ))}

              {/* Show share redacted button for high confidence PII */}
              {piiResult.confidence === 'high' &&
                redactionRegions.length > 0 && (
                  <>
                    <Text
                      style={[
                        styles.warningSubtitle,
                        { color: currentTheme.colors.textSecondary },
                        styles.warningSubtitleRedacted,
                      ]}
                    >
                      🛡️ Redaction applied
                    </Text>
                    <TouchableOpacity
                      style={[
                        styles.shareButton,
                        { backgroundColor: currentTheme.colors.warning },
                      ]}
                      onPress={handleShare}
                    >
                      <Text
                        style={[
                          styles.shareButtonText,
                          { color: currentTheme.colors.textInverse },
                        ]}
                      >
                        📤 Share Redacted
                      </Text>
                    </TouchableOpacity>
                  </>
                )}
            </>
          ) : (
            <>
              <Text style={styles.safeIcon}>✅</Text>
              <Text
                style={[
                  styles.safeTitle,
                  { color: currentTheme.colors.success },
                ]}
              >
                No PII Detected
              </Text>
              <Text
                style={[
                  styles.safeText,
                  { color: currentTheme.colors.textSecondary },
                ]}
              >
                Safe to share!
              </Text>
              <Text
                style={[
                  styles.confidence,
                  { color: currentTheme.colors.textTertiary },
                ]}
              >
                Confidence: {piiResult.confidence}
              </Text>

              <TouchableOpacity
                style={[
                  styles.shareButton,
                  { backgroundColor: currentTheme.colors.primary },
                ]}
                onPress={handleShare}
              >
                <Text
                  style={[
                    styles.shareButtonText,
                    { color: currentTheme.colors.textInverse },
                  ]}
                >
                  📤 Share Safely
                </Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      );
    }

    // System/default message
    const isLoading = item.status === 'processing';
    const isError = item.status === 'error';

    // Show shimmer skeleton for processing messages
    if (isLoading && item.type === 'system') {
      return <ShimmerSkeleton />;
    }

    return (
      <View
        style={[
          styles.systemMessage,
          { backgroundColor: currentTheme.colors.backgroundSecondary },
          isError && {
            backgroundColor: currentTheme.colors.errorLight,
            borderColor: currentTheme.colors.error,
          },
        ]}
      >
        {isLoading && (
          <ActivityIndicator
            size="small"
            color={currentTheme.colors.textSecondary}
            style={styles.loadingSpinner}
          />
        )}
        <Text
          style={[
            styles.systemText,
            { color: currentTheme.colors.textSecondary },
            isError && { color: currentTheme.colors.error },
          ]}
        >
          {item.content}
        </Text>
        {isError && (
          <TouchableOpacity
            style={[
              styles.retryButton,
              { backgroundColor: currentTheme.colors.primary },
            ]}
            onPress={() => handleRetryMessage(item.id)}
          >
            <Text
              style={[
                styles.retryText,
                { color: currentTheme.colors.textInverse },
              ]}
            >
              ↻ Retry
            </Text>
          </TouchableOpacity>
        )}
      </View>
    );
  };

  // Loading states
  const isDownloading = visionLM.isDownloading || textLM.isDownloading;
  const visionProgress = visionLM.isDownloaded ? 1 : visionLM.downloadProgress;
  const textProgress = textLM.isDownloaded ? 1 : textLM.downloadProgress;
  const downloadProgress = (visionProgress + textProgress) / 2;

  if (isDownloading) {
    return (
      <SafeAreaView
        style={[
          styles.container,
          { backgroundColor: currentTheme.colors.background },
        ]}
      >
        <View style={styles.loading}>
          <ActivityIndicator size="large" color="#007AFF" />
          <Text style={styles.loadingText}>Downloading AI Models...</Text>
          <Text style={styles.loadingSubtext}>
            Overall: {Math.round(downloadProgress * 100)}%
          </Text>
          <Text style={styles.loadingSubtext}>
            Vision:{' '}
            {visionLM.isDownloaded
              ? '✅'
              : `${Math.round(visionLM.downloadProgress * 100)}%`}
          </Text>
          <Text style={styles.loadingSubtext}>
            Text:{' '}
            {textLM.isDownloaded
              ? '✅'
              : `${Math.round(textLM.downloadProgress * 100)}%`}
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView
      style={[
        styles.container,
        { backgroundColor: currentTheme.colors.backgroundSecondary },
      ]}
      edges={['bottom']}
    >
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={90}
      >
        {/* Image Preview with Redaction Overlay */}
        <View style={styles.imagePreviewContainer}>
          <View style={styles.imagePreview}>
            <RedactedImage
              ref={redactedImageRef}
              imageUri={currentImage}
              regions={redactionRegions}
              enabled={showRedaction}
              style={styles.previewImage}
            />

            {/* Redaction Toggle Button */}
            {redactionRegions.length > 0 && (
              <TouchableOpacity
                style={styles.redactionToggle}
                onPress={() => setShowRedaction(!showRedaction)}
              >
                <Text style={styles.redactionToggleText}>
                  {showRedaction ? '👁️ Show Original' : '🔒 Show Redacted'}
                </Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Multi-image navigation */}
          {allImages.length > 1 && (
            <View style={styles.imageNavigation}>
              <TouchableOpacity
                style={[
                  styles.navButton,
                  currentImageIndex === 0 && styles.navButtonDisabled,
                ]}
                onPress={handlePreviousImage}
                disabled={currentImageIndex === 0}
              >
                <Text style={styles.navButtonText}>◀</Text>
              </TouchableOpacity>

              <Text style={styles.imageCounter}>
                {currentImageIndex + 1} / {allImages.length}
              </Text>

              <TouchableOpacity
                style={[
                  styles.navButton,
                  currentImageIndex === allImages.length - 1 &&
                    styles.navButtonDisabled,
                ]}
                onPress={handleNextImage}
                disabled={currentImageIndex === allImages.length - 1}
              >
                <Text style={styles.navButtonText}>▶</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Action buttons - shown after scanning complete */}
          {scannedImages.size > 0 && (
            <View style={styles.imageActionsBar}>
              <View style={styles.actionButtonsRow}>
                <TouchableOpacity
                  style={styles.actionButton}
                  onPress={handleRetryCurrent}
                >
                  <Text style={styles.actionButtonLabel} numberOfLines={1}>
                    {allImages.length > 1 ? '↻ Retry All Images' : '↻ Retry'}
                  </Text>
                </TouchableOpacity>

                {(() => {
                  const allScanned = scannedImages.size === allImages.length;
                  const hasSharableImages = Array.from(scannedImages).some(
                    (img) => {
                      const result = scanResults.get(img);
                      // Can share if no PII, or high confidence PII with redaction
                      const noPII =
                        result?.piiResult && !result.piiResult.hasPII;
                      const hasRedaction =
                        result?.piiResult?.hasPII &&
                        result?.piiResult?.confidence === 'high' &&
                        result?.redactionRegions?.length > 0;
                      return noPII || hasRedaction;
                    }
                  );
                  const canShare = allScanned && hasSharableImages;

                  return (
                    <TouchableOpacity
                      style={[
                        styles.actionButton,
                        { backgroundColor: theme.colors.primary },
                        !canShare && styles.disabledButton,
                      ]}
                      onPress={handleShareAll}
                      disabled={!canShare}
                    >
                      <Text style={styles.actionButtonLabel} numberOfLines={1}>
                        {allImages.length > 1 ? '📤 Share Safe' : '📤 Share'}
                      </Text>
                    </TouchableOpacity>
                  );
                })()}
              </View>
            </View>
          )}
        </View>

        {/* Feed (Inverted - newest on top) */}
        <FlatList
          ref={flatListRef}
          data={messages}
          renderItem={renderMessage}
          keyExtractor={(item) => item.id}
          inverted
          style={styles.feed}
          contentContainerStyle={styles.feedContent}
          showsVerticalScrollIndicator={false}
        />

        {/* Sticky Footer */}
        <View style={styles.stickyFooter}>
          {(messageQueue.pending.length > 0 ||
            visionLM.isGenerating ||
            textLM.isGenerating) && (
            <View style={styles.queueIndicator}>
              <Text style={styles.queueText}>
                {messageQueue.pending.length > 0
                  ? `⏳ ${messageQueue.pending.length} message(s) queued`
                  : '🔍 Processing...'}
              </Text>
            </View>
          )}
          <View style={styles.inputContainer}>
            <TextInput
              style={styles.input}
              value={chatInput}
              onChangeText={setChatInput}
              placeholder="Ask ScreenSafe anything..."
              placeholderTextColor="#999"
              multiline
              maxLength={500}
            />
            <TouchableOpacity
              style={[
                styles.sendButton,
                !chatInput.trim() && styles.sendButtonDisabled,
              ]}
              onPress={handleSendMessage}
              disabled={!chatInput.trim()}
            >
              <Text style={styles.sendButtonText}>📤</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>

      {/* Settings Modal */}
      <Modal
        visible={showSettings}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowSettings(false)}
      >
        <View
          style={[
            styles.settingsContainer,
            { backgroundColor: currentTheme.colors.backgroundSecondary },
          ]}
        >
          <View
            style={[
              styles.settingsHeader,
              {
                backgroundColor: currentTheme.colors.background,
                borderBottomColor: currentTheme.colors.border,
              },
            ]}
          >
            <Text
              style={[
                styles.settingsTitle,
                { color: currentTheme.colors.textPrimary },
              ]}
            >
              Settings
            </Text>
            <TouchableOpacity onPress={() => setShowSettings(false)}>
              <Text
                style={[
                  styles.closeButton,
                  { color: currentTheme.colors.primary },
                ]}
              >
                Done
              </Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.settingsContent}>
            <View
              style={[
                styles.settingSection,
                { backgroundColor: currentTheme.colors.background },
              ]}
            >
              <Text
                style={[
                  styles.sectionTitle,
                  { color: currentTheme.colors.textSecondary },
                ]}
              >
                Cloud Inference
              </Text>
              <View
                style={[
                  styles.settingRow,
                  { borderBottomColor: currentTheme.colors.borderLight },
                ]}
              >
                <Text
                  style={[
                    styles.settingLabel,
                    { color: currentTheme.colors.textPrimary },
                  ]}
                >
                  Enable Cloud Analysis
                </Text>
                <Switch
                  value={settings.allowCloud}
                  onValueChange={(val) => {
                    const newSettings = { ...settings, allowCloud: val };
                    setSettings(newSettings);
                    SettingsService.saveSettings(newSettings);
                  }}
                  trackColor={{
                    false: currentTheme.colors.border,
                    true: currentTheme.colors.success,
                  }}
                  thumbColor={
                    Platform.OS === 'android'
                      ? currentTheme.colors.background
                      : undefined
                  }
                />
              </View>
              <Text
                style={[
                  styles.settingDescription,
                  {
                    color: currentTheme.colors.textSecondary,
                    backgroundColor: currentTheme.colors.backgroundSecondary,
                  },
                ]}
              >
                Use cloud models for higher accuracy when local detection is
                uncertain.
              </Text>
            </View>

            {settings.allowCloud && (
              <View
                style={[
                  styles.settingSection,
                  { backgroundColor: currentTheme.colors.background },
                ]}
              >
                <Text
                  style={[
                    styles.sectionTitle,
                    { color: currentTheme.colors.textSecondary },
                  ]}
                >
                  Cloud Configuration
                </Text>

                <Text
                  style={[
                    styles.inputLabel,
                    { color: currentTheme.colors.textSecondary },
                  ]}
                >
                  Proxy Base URL
                </Text>
                <TextInput
                  style={[
                    styles.settingInput,
                    {
                      backgroundColor: currentTheme.colors.background,
                      color: currentTheme.colors.textPrimary,
                      borderBottomColor: currentTheme.colors.borderLight,
                    },
                  ]}
                  value={settings.cloudBaseUrl}
                  onChangeText={(text) => {
                    const newSettings = { ...settings, cloudBaseUrl: text };
                    setSettings(newSettings);
                    SettingsService.saveSettings(newSettings);
                  }}
                  placeholder="https://dspy-proxy.onrender.com"
                  placeholderTextColor={currentTheme.colors.textTertiary}
                  autoCapitalize="none"
                  autoCorrect={false}
                  clearButtonMode="while-editing"
                />

                <Text
                  style={[
                    styles.inputLabel,
                    { color: currentTheme.colors.textSecondary },
                  ]}
                >
                  Provider
                </Text>
                <TextInput
                  style={[
                    styles.settingInput,
                    {
                      backgroundColor: currentTheme.colors.background,
                      color: currentTheme.colors.textPrimary,
                      borderBottomColor: currentTheme.colors.borderLight,
                    },
                  ]}
                  value={settings.cloudProvider}
                  onChangeText={(text) => {
                    const newSettings = { ...settings, cloudProvider: text };
                    setSettings(newSettings);
                    SettingsService.saveSettings(newSettings);
                  }}
                  placeholder="e.g., openai"
                  placeholderTextColor={currentTheme.colors.textTertiary}
                  autoCapitalize="none"
                  clearButtonMode="while-editing"
                />

                <Text
                  style={[
                    styles.inputLabel,
                    { color: currentTheme.colors.textSecondary },
                  ]}
                >
                  Model
                </Text>
                <TextInput
                  style={[
                    styles.settingInput,
                    {
                      backgroundColor: currentTheme.colors.background,
                      color: currentTheme.colors.textPrimary,
                      borderBottomColor: currentTheme.colors.borderLight,
                    },
                  ]}
                  value={settings.cloudModel}
                  onChangeText={(text) => {
                    const newSettings = { ...settings, cloudModel: text };
                    setSettings(newSettings);
                    SettingsService.saveSettings(newSettings);
                  }}
                  placeholder="e.g., gpt-4o-mini"
                  placeholderTextColor={currentTheme.colors.textTertiary}
                  autoCapitalize="none"
                  clearButtonMode="while-editing"
                />

                <Text
                  style={[
                    styles.inputLabel,
                    { color: currentTheme.colors.textSecondary },
                  ]}
                >
                  API Key
                </Text>
                <TextInput
                  style={[
                    styles.settingInput,
                    {
                      backgroundColor: currentTheme.colors.background,
                      color: currentTheme.colors.textPrimary,
                      borderBottomColor: currentTheme.colors.borderLight,
                    },
                  ]}
                  value={settings.cloudApiKey}
                  onChangeText={(text) => {
                    const newSettings = { ...settings, cloudApiKey: text };
                    setSettings(newSettings);
                    SettingsService.saveSettings(newSettings);
                  }}
                  placeholder="Enter API Key"
                  placeholderTextColor={currentTheme.colors.textTertiary}
                  secureTextEntry
                  autoCapitalize="none"
                  clearButtonMode="while-editing"
                />
              </View>
            )}
          </ScrollView>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.backgroundSecondary,
  },
  loading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: theme.spacing.lg,
  },
  loadingText: {
    marginTop: theme.spacing.base,
    fontSize: theme.typography.fontSize.lg,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.textPrimary,
  },
  loadingSubtext: {
    marginTop: theme.spacing.sm,
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.textSecondary,
  },
  imagePreviewContainer: {
    backgroundColor: theme.colors.background,
  },
  imagePreview: {
    height: 200,
    backgroundColor: '#000',
  },
  imageNavigation: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: theme.colors.glassDark,
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  navButton: {
    backgroundColor: theme.colors.glassLight,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    minWidth: 44,
    alignItems: 'center',
  },
  navButtonDisabled: {
    opacity: 0.3,
  },
  navButtonText: {
    color: theme.colors.textInverse,
    fontSize: 18,
    fontWeight: '600',
  },
  imageCounter: {
    color: theme.colors.textInverse,
    fontSize: 14,
    fontWeight: '600',
  },
  previewImage: {
    width: '100%',
    height: '100%',
  },
  redactionToggle: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: theme.colors.glassDark,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  redactionToggleText: {
    color: theme.colors.textInverse,
    fontSize: 12,
    fontWeight: '600',
  },
  imageActionsBar: {
    backgroundColor: theme.colors.glassDark,
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  actionButtonsRow: {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  actionButton: {
    flex: 1,
    height: 44,
    backgroundColor: theme.colors.glassLight,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'flex-start',
  },
  actionButtonLabel: {
    color: theme.colors.textInverse,
    fontSize: 15,
    fontWeight: '600',
    textAlign: 'center',
  },
  feed: {
    flex: 1,
  },
  feedContent: {
    padding: 12,
    gap: 10,
  },
  // User messages
  userMessageContainer: {
    alignSelf: 'flex-end',
    maxWidth: '80%',
  },
  userBubble: {
    backgroundColor: theme.colors.primary,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing.md,
    paddingHorizontal: theme.spacing.base,
    ...theme.shadows.sm,
  },
  userText: {
    color: theme.colors.textInverse,
    fontSize: theme.typography.fontSize.base,
    lineHeight:
      theme.typography.fontSize.base * theme.typography.lineHeight.normal,
  },
  messageActions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
    alignSelf: 'flex-end',
  },
  messageActionButton: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: theme.colors.backgroundSecondary,
  },
  actionButtonText: {
    fontSize: 12,
    color: theme.colors.primary,
    fontWeight: '600',
  },
  // Stage 1 message
  stage1Container: {
    backgroundColor: theme.colors.infoLight,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: theme.colors.info,
  },
  stage1Title: {
    fontSize: 16,
    fontWeight: '700',
    color: theme.colors.textPrimary,
    marginBottom: 8,
  },
  stage1Box: {
    backgroundColor: theme.colors.background,
    borderRadius: 8,
    padding: 12,
  },
  stage1Text: {
    fontSize: 14,
    color: theme.colors.textPrimary,
    lineHeight: 20,
  },
  // PII result cards
  warningCard: {
    backgroundColor: theme.colors.errorLight,
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing.lg,
    borderWidth: 2,
    borderColor: theme.colors.error,
    alignItems: 'center',
    ...theme.shadows.md,
  },
  warningIcon: {
    fontSize: theme.typography.fontSize['5xl'],
    marginBottom: theme.spacing.md,
  },
  warningTitle: {
    fontSize: theme.typography.fontSize.xl,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.error,
    marginBottom: theme.spacing.sm,
  },
  warningSubtitle: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.md,
  },
  piiItem: {
    backgroundColor: 'rgba(255, 59, 48, 0.1)',
    borderRadius: theme.borderRadius.sm,
    padding: theme.spacing.sm,
    marginTop: theme.spacing.xs,
    width: '100%',
  },
  piiText: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.error,
  },
  safeCard: {
    backgroundColor: theme.colors.successLight,
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing.lg,
    borderWidth: 2,
    borderColor: theme.colors.success,
    alignItems: 'center',
    ...theme.shadows.md,
  },
  safeIcon: {
    fontSize: 48,
    marginBottom: 12,
  },
  safeTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: theme.colors.success,
    marginBottom: 8,
  },
  safeText: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    marginBottom: 4,
  },
  confidence: {
    fontSize: 12,
    color: theme.colors.textTertiary,
    marginBottom: 16,
  },
  shareButton: {
    backgroundColor: theme.colors.primary,
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 12,
    marginTop: 8,
    minWidth: 200,
  },
  shareButtonText: {
    color: theme.colors.textInverse,
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
  },
  // System messages
  systemMessage: {
    backgroundColor: theme.colors.backgroundSecondary,
    borderRadius: 12,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  systemText: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    flex: 1,
  },
  loadingSpinner: {
    marginRight: 4,
  },
  errorMessage: {
    backgroundColor: theme.colors.errorLight,
    borderColor: theme.colors.error,
    borderWidth: 1,
  },
  errorText: {
    color: theme.colors.error,
  },
  retryButton: {
    backgroundColor: theme.colors.primary,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  retryText: {
    color: theme.colors.textInverse,
    fontSize: 12,
    fontWeight: '600',
  },
  // Skeleton loading with shimmer
  skeletonContainer: {
    backgroundColor: theme.colors.background,
    borderRadius: theme.borderRadius.base,
    padding: theme.spacing.base,
    marginVertical: theme.spacing.xs,
    overflow: 'hidden',
  },
  skeletonLine: {
    height: 12,
    backgroundColor: theme.colors.backgroundTertiary,
    borderRadius: theme.borderRadius.sm,
    marginBottom: theme.spacing.sm,
    overflow: 'hidden',
  },
  skeletonLineShort: {
    width: '60%',
  },
  shimmerOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: theme.colors.glassLight,
    width: 100,
  },
  skeletonSpinner: {
    marginTop: theme.spacing.sm,
    alignSelf: 'flex-start',
  },
  // Sticky footer
  stickyFooter: {
    backgroundColor: theme.colors.background,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 10,
  },
  queueIndicator: {
    backgroundColor: theme.colors.warningLight,
    padding: 8,
    alignItems: 'center',
  },
  queueText: {
    fontSize: 12,
    color: theme.colors.warning,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    padding: 12,
    gap: 10,
    backgroundColor: theme.colors.background,
    borderTopWidth: 1,
    borderTopColor: theme.colors.borderLight,
  },
  input: {
    flex: 1,
    backgroundColor: theme.colors.backgroundSecondary,
    borderRadius: 24,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    maxHeight: 100,
    color: theme.colors.textPrimary,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  sendButton: {
    width: 44,
    height: 44,
    backgroundColor: theme.colors.primary,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    ...theme.shadows.sm,
  },
  sendButtonDisabled: {
    backgroundColor: theme.colors.border,
  },
  sendButtonText: {
    fontSize: 20,
  },
  settingsContainer: {
    flex: 1,
    backgroundColor: theme.colors.backgroundSecondary,
  },
  settingsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    backgroundColor: theme.colors.background,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
    ...theme.shadows.sm,
    zIndex: 10,
  },
  settingsTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: theme.colors.textPrimary,
  },
  closeButton: {
    fontSize: 17,
    color: theme.colors.primary,
    fontWeight: '600',
  },
  settingsContent: {
    flex: 1,
    padding: theme.spacing.base,
  },
  settingSection: {
    marginBottom: theme.spacing.xl,
    backgroundColor: theme.colors.background,
    borderRadius: theme.borderRadius.lg,
    overflow: 'hidden',
    ...theme.shadows.sm,
  },
  sectionTitle: {
    fontSize: 13,
    color: theme.colors.textSecondary,
    textTransform: 'uppercase',
    marginLeft: theme.spacing.base,
    marginBottom: theme.spacing.sm,
    marginTop: theme.spacing.lg,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.base,
    paddingVertical: theme.spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.borderLight,
  },
  settingLabel: {
    fontSize: 17,
    color: theme.colors.textPrimary,
    fontWeight: '500',
  },
  settingDescription: {
    fontSize: 13,
    color: theme.colors.textSecondary,
    paddingHorizontal: theme.spacing.base,
    paddingVertical: theme.spacing.sm,
    backgroundColor: theme.colors.backgroundSecondary,
  },
  inputLabel: {
    fontSize: 13,
    color: theme.colors.textSecondary,
    marginLeft: theme.spacing.base,
    marginTop: theme.spacing.md,
    marginBottom: theme.spacing.xs,
    fontWeight: '500',
  },
  settingInput: {
    backgroundColor: theme.colors.background,
    paddingHorizontal: theme.spacing.base,
    paddingVertical: theme.spacing.md,
    fontSize: 17,
    color: theme.colors.textPrimary,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.borderLight,
  },
  headerButton: {
    padding: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerButtonText: {
    fontSize: 24,
    lineHeight: 26,
    textAlign: 'center',
  },
  piiItemRed: {
    backgroundColor: 'rgba(255, 59, 48, 0.1)',
  },
  warningSubtitleRedacted: {
    marginTop: 12,
  },
  disabledButton: {
    opacity: 0.3,
  },
  headerRightContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 4,
  },
  headerRetryButton: {
    marginRight: 16,
  },
  headerRetryText: {
    fontSize: 16,
  },
});
// Shimmer Skeleton Component for loading states
const ShimmerSkeleton = () => {
  const shimmerRef = useRef(createShimmerAnimation()).current;

  useEffect(() => {
    shimmerRef.animation.start();
    return () => shimmerRef.animation.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const translateX = shimmerRef.animatedValue.interpolate({
    inputRange: [0, 1],
    outputRange: [-300, 300],
  });

  return (
    <View style={styles.skeletonContainer}>
      <View style={styles.skeletonLine}>
        <Animated.View
          style={[styles.shimmerOverlay, { transform: [{ translateX }] }]}
        />
      </View>
      <View style={[styles.skeletonLine, styles.skeletonLineShort]}>
        <Animated.View
          style={[styles.shimmerOverlay, { transform: [{ translateX }] }]}
        />
      </View>
    </View>
  );
};
