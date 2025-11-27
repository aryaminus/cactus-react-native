package com.csslabs.screensafe

import android.content.Intent
import android.net.Uri
import android.os.Bundle
import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.fabricEnabled
import com.facebook.react.defaults.DefaultReactActivityDelegate
import com.facebook.react.modules.core.DeviceEventManagerModule

class MainActivity : ReactActivity() {

  /**
   * Returns the name of the main component registered from JavaScript. This is used to schedule
   * rendering of the component.
   */
  override fun getMainComponentName(): String = "ScreenSafe"

  /**
   * Returns the instance of the [ReactActivityDelegate]. We use [DefaultReactActivityDelegate]
   * which allows you to enable New Architecture with a single boolean flags [fabricEnabled]
   */
  override fun createReactActivityDelegate(): ReactActivityDelegate =
      object : DefaultReactActivityDelegate(this, mainComponentName, fabricEnabled) {
        override fun getLaunchOptions(): Bundle? {
          val initialProps = Bundle()
          intent?.let {
            if (it.action == Intent.ACTION_SEND && it.type?.startsWith("image/") == true) {
               (it.getParcelableExtra<Uri>(Intent.EXTRA_STREAM))?.let { uri ->
                 initialProps.putString("sharedImageUri", uri.toString())
               }
            }
          }
          return initialProps
        }
      }

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    // Handle intent if app is launched via share
    intent?.let { handleIntent(it) }
  }

  override fun onNewIntent(intent: Intent) {
    super.onNewIntent(intent)
    setIntent(intent)
    handleIntent(intent)
  }

  private fun handleIntent(intent: Intent) {
    when (intent.action) {
      Intent.ACTION_SEND -> {
        if (intent.type?.startsWith("image/") == true) {
          handleSharedImage(intent)
        }
      }
    }
  }

  private fun handleSharedImage(intent: Intent) {
    (intent.getParcelableExtra<Uri>(Intent.EXTRA_STREAM))?.let { imageUri ->
      val sharedImageUri = imageUri.toString()
      
      // Emit event to React Native
      // Note: For cold starts, this might miss if JS isn't ready. 
      // In a full prod app, we'd check context state or use a native module to retrieve initial share.
      reactInstanceManager?.currentReactContext
          ?.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
          ?.emit("onSharedImage", sharedImageUri)
    }
  }
}
