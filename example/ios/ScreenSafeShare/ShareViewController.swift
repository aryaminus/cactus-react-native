import UIKit
import Social
import MobileCoreServices
import UniformTypeIdentifiers

class ShareViewController: UIViewController {
    
    override func viewDidLoad() {
        super.viewDidLoad()
        
        // Set background to clear/transparent
        view.backgroundColor = .clear
        
        // Process the shared content immediately
        processSharedContent()
    }
    
    private func processSharedContent() {
        guard let extensionItem = extensionContext?.inputItems.first as? NSExtensionItem,
              let itemProvider = extensionItem.attachments?.first else {
            print("[ShareExtension] No extension item or attachment")
            closeExtension()
            return
        }
        
        let imageType = UTType.image.identifier
        guard itemProvider.hasItemConformingToTypeIdentifier(imageType) else {
            print("[ShareExtension] Attachment is not an image")
            closeExtension()
            return
        }
        
        // Load the image
        itemProvider.loadItem(forTypeIdentifier: imageType, options: nil) { [weak self] (imageData, error) in
            guard let self = self else { return }
            
            DispatchQueue.main.async {
                if let error = error {
                    print("[ShareExtension] Error loading image: \(error)")
                    self.closeExtension()
                    return
                }
                
                var imageURL: URL?
                
                // Handle different image data types
                if let url = imageData as? URL {
                    print("[ShareExtension] Got URL: \(url)")
                    imageURL = url
                } else if let image = imageData as? UIImage {
                    print("[ShareExtension] Got UIImage, saving to temp")
                    imageURL = self.saveImageToTemp(image: image)
                } else if let data = imageData as? Data, let image = UIImage(data: data) {
                    print("[ShareExtension] Got Data, converting to UIImage and saving")
                    imageURL = self.saveImageToTemp(image: image)
                }
                
                if let imageURL = imageURL {
                    print("[ShareExtension] Opening main app with image: \(imageURL)")
                    self.openMainApp(imageURL: imageURL)
                } else {
                    print("[ShareExtension] Failed to get image URL")
                    self.closeExtension()
                }
            }
        }
    }
    
    private func saveImageToTemp(image: UIImage) -> URL? {
        guard let data = image.jpegData(compressionQuality: 0.9) else {
            print("[ShareExtension] Failed to convert image to JPEG")
            return nil
        }
        
        let tempDir = FileManager.default.temporaryDirectory
        let imageURL = tempDir.appendingPathComponent("shared_image_\(UUID().uuidString).jpg")
        
        do {
            try data.write(to: imageURL)
            print("[ShareExtension] Saved image to: \(imageURL.path)")
            return imageURL
        } catch {
            print("[ShareExtension] Failed to save image: \(error)")
            return nil
        }
    }
    
    private func openMainApp(imageURL: URL) {
        // Load the image data
        guard let imageData = try? Data(contentsOf: imageURL),
              let image = UIImage(data: imageData) else {
            NSLog("[ShareExtension] Failed to load image data")
            closeExtension()
            return
        }
        
        // Copy to Pasteboard (General pasteboard is shared between apps)
        UIPasteboard.general.image = image
        NSLog("[ShareExtension] Image copied to pasteboard")
        
        // Create deep link URL with pasteboard flag
        guard let deepLinkURL = URL(string: "screensafe://scan?pasteboard=true") else {
            NSLog("[ShareExtension] Failed to create deep link URL")
            closeExtension()
            return
        }
        
        NSLog("[ShareExtension] Deep link created: \(deepLinkURL.absoluteString)")
        
        // Open the URL using the responder chain (safest way for extensions)
        // We need to find the UIApplication, but extensions don't have direct access.
        // We traverse the responder chain to find an object that responds to openURL:
        
        var responder: UIResponder? = self
        var success = false
        
        while let r = responder {
            if let application = r as? UIApplication {
                // Found UIApplication directly (rare in extensions but possible)
                application.open(deepLinkURL, options: [:], completionHandler: nil)
                NSLog("[ShareExtension] Opened via UIApplication direct access")
                success = true
                break
            }
            
            if r.responds(to: Selector("openURL:")) {
                // Found a responder that implements openURL:
                r.perform(Selector("openURL:"), with: deepLinkURL)
                NSLog("[ShareExtension] Opened via UIResponder chain openURL:")
                success = true
                break
            }
            
            responder = r.next
        }
        
        if !success {
             NSLog("[ShareExtension] Failed to find responder to open URL")
             // Fallback: Try NSExtensionContext open (often fails for Share Extensions but worth a try)
             extensionContext?.open(deepLinkURL, completionHandler: { (success) in
                 NSLog("[ShareExtension] NSExtensionContext open result: \(success)")
             })
        }
        
        // Close the extension after a brief delay
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) { [weak self] in
            NSLog("[ShareExtension] Closing extension")
            self?.closeExtension()
        }
    }
    
    private func closeExtension() {
        extensionContext?.completeRequest(returningItems: [], completionHandler: nil)
    }
}
