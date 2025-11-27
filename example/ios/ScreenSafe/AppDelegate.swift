import UIKit
import React
import React_RCTAppDelegate
import ReactAppDependencyProvider

@main
class AppDelegate: UIResponder, UIApplicationDelegate {
  var window: UIWindow?

  var reactNativeDelegate: ReactNativeDelegate?
  var reactNativeFactory: RCTReactNativeFactory?

  func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
  ) -> Bool {
    let delegate = ReactNativeDelegate()
    let factory = RCTReactNativeFactory(delegate: delegate)
    delegate.dependencyProvider = RCTAppDependencyProvider()

    reactNativeDelegate = delegate
    reactNativeFactory = factory

    window = UIWindow(frame: UIScreen.main.bounds)

    factory.startReactNative(
      withModuleName: "ScreenSafe",
      in: window,
      launchOptions: launchOptions
    )

    return true
  }

  func application(
    _ app: UIApplication,
    open url: URL,
    options: [UIApplication.OpenURLOptionsKey : Any] = [:]
  ) -> Bool {
    var urlToOpen = url
    
    // Check for pasteboard flag
    if let components = URLComponents(url: url, resolvingAgainstBaseURL: true),
       let queryItems = components.queryItems,
       queryItems.contains(where: { $0.name == "pasteboard" && $0.value == "true" }) {
      
      // Try to get image from pasteboard
      if let image = UIPasteboard.general.image,
         let data = image.jpegData(compressionQuality: 0.9) {
        
        // Save to app's temp directory
        let tempDir = FileManager.default.temporaryDirectory
        let fileName = "shared_pasteboard_\(UUID().uuidString).jpg"
        let fileURL = tempDir.appendingPathComponent(fileName)
        
        do {
          try data.write(to: fileURL)
          
          // Rewrite URL to point to the file
          if var newComponents = URLComponents(url: url, resolvingAgainstBaseURL: true) {
            // Remove pasteboard param and add image param
            var newQueryItems = queryItems.filter { $0.name != "pasteboard" }
            newQueryItems.append(URLQueryItem(name: "image", value: fileURL.absoluteString))
            newComponents.queryItems = newQueryItems
            
            if let newURL = newComponents.url {
              urlToOpen = newURL
              NSLog("[AppDelegate] Converted pasteboard image to file: \(newURL.absoluteString)")
            }
          }
        } catch {
          NSLog("[AppDelegate] Failed to save pasteboard image: \(error)")
        }
      }
    }
    
    return RCTLinkingManager.application(app, open: urlToOpen, options: options)
  }
}

class ReactNativeDelegate: RCTDefaultReactNativeFactoryDelegate {
  override func sourceURL(for bridge: RCTBridge) -> URL? {
    self.bundleURL()
  }

  override func bundleURL() -> URL? {
#if DEBUG
    RCTBundleURLProvider.sharedSettings().jsBundleURL(forBundleRoot: "index")
#else
    Bundle.main.url(forResource: "main", withExtension: "jsbundle")
#endif
  }
}
