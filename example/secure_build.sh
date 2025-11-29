#!/bin/bash
set -e

# Service name for Keychain
SERVICE_NAME="screensafe-release"

echo "Fetching credentials from macOS Keychain for service: $SERVICE_NAME..."

# Try to fetch passwords
# Note: -w returns only the password string
STORE_PASSWORD=$(security find-generic-password -a "MYAPP_RELEASE_STORE_PASSWORD" -s "$SERVICE_NAME" -w 2>/dev/null || true)
KEY_PASSWORD=$(security find-generic-password -a "MYAPP_RELEASE_KEY_PASSWORD" -s "$SERVICE_NAME" -w 2>/dev/null || true)

if [ -z "$STORE_PASSWORD" ] || [ -z "$KEY_PASSWORD" ]; then
    echo "❌ Error: Could not retrieve passwords from Keychain."
    echo ""
    echo "Please add them to your Keychain using the following commands:"
    echo ""
    echo "  security add-generic-password -a \"MYAPP_RELEASE_STORE_PASSWORD\" -s \"$SERVICE_NAME\" -w \"YOUR_STORE_PASSWORD\""
    echo "  security add-generic-password -a \"MYAPP_RELEASE_KEY_PASSWORD\" -s \"$SERVICE_NAME\" -w \"YOUR_KEY_PASSWORD\""
    echo ""
    echo "Replace YOUR_STORE_PASSWORD and YOUR_KEY_PASSWORD with the actual values."
    exit 1
fi

echo "✅ Credentials loaded successfully."

# Export as environment variables for Gradle
export MYAPP_RELEASE_STORE_PASSWORD="$STORE_PASSWORD"
export MYAPP_RELEASE_KEY_PASSWORD="$KEY_PASSWORD"

echo "🚀 Starting Release Build..."
# Navigate to the directory where the script is located, then into android
cd "$(dirname "$0")/android"
./gradlew assembleRelease

echo "✨ Build completed successfully!"
