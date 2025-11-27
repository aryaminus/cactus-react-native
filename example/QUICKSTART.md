# ScreenSafe Quickstart

## Prerequisites
- The ScreenSafe app uses the **lfm2-vl-450m** vision model from Cactus for on-device PII detection (~450MB)

## 1. Setup & Install

```bash
# 1. Clone the engine (Cactus)
git clone git@github.com:cactus-compute/cactus-react-native.git
cd cactus-react-native/example

# 2. Install dependencies
yarn install

# 3. ⚠️ CRITICAL: Inject ScreenSafe Code ⚠️
# This replaces the default example with our Hackathon project
# (Run this if you haven't already)
cp -r ~/Developer/hera/screensafe/src/* src/
yarn add @bam.tech/react-native-image-resizer react-native-image-picker react-native-fs @react-navigation/native @react-navigation/native-stack react-native-screens react-native-safe-area-context

# 4. iOS Setup
cd ios
pod install
cd ..
```

## 2. Run the App

```bash
# Run on iOS Simulator
yarn ios
```

> **Troubleshooting:** If `yarn ios` fails with Ruby errors (common on some Macs), you can:
> 1. Open `ios/CactusExample.xcworkspace` in Xcode and run.
> 2. **OR** run this manual command to force-launch from terminal:
>    ```bash
>    # Build
>    xcodebuild -workspace ios/CactusExample.xcworkspace -scheme CactusExample -configuration Debug -sdk iphonesimulator -destination 'platform=iOS Simulator,name=iPhone 15 Pro' -derivedDataPath ios/build
>    
>    # Install & Launch
>    xcrun simctl install booted ios/build/Build/Products/Debug-iphonesimulator/CactusExample.app
>    xcrun simctl launch booted cactus.example
>    ```
