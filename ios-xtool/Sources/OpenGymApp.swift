import SwiftUI
import WebKit

@main
struct OpenGymApp: App {
    var body: some Scene {
        WindowGroup {
            ContentView()
                .ignoresSafeArea()
                .background(Color(red: 20/255, green: 19/255, blue: 18/255))
        }
    }
}

struct ContentView: View {
    var body: some View {
        WebView()
            .edgesIgnoringSafeArea(.all)
    }
}

struct WebView: UIViewRepresentable {
    func makeUIView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        config.allowsInlineMediaPlayback = true
        config.mediaTypesRequiringUserActionForPlayback = []
        config.preferences.setValue(true, forKey: "allowFileAccessFromFileURLs")

        let webView = WKWebView(frame: .zero, configuration: config)
        webView.isOpaque = false
        webView.backgroundColor = UIColor(red: 20/255, green: 19/255, blue: 18/255, alpha: 1.0)
        webView.scrollView.backgroundColor = UIColor(red: 20/255, green: 19/255, blue: 18/255, alpha: 1.0)
        webView.scrollView.bounces = false
        webView.scrollView.alwaysBounceVertical = false
        webView.scrollView.alwaysBounceHorizontal = false
        webView.scrollView.contentInsetAdjustmentBehavior = .never

        // Try locating bundled web directory
        if let resourceURL = Bundle.main.resourceURL {
            let possiblePaths = [
                resourceURL.appendingPathComponent("Web"),
                resourceURL.appendingPathComponent("OpenGym_OpenGym.bundle/Web")
            ]
            for webDir in possiblePaths {
                let indexURL = webDir.appendingPathComponent("index.html")
                if FileManager.default.fileExists(atPath: indexURL.path) {
                    webView.loadFileURL(indexURL, allowingReadAccessTo: webDir)
                    return webView
                }
            }
        }

        if let htmlURL = Bundle.main.url(forResource: "index", withExtension: "html", subdirectory: "Web") {
            let webDir = htmlURL.deletingLastPathComponent()
            webView.loadFileURL(htmlURL, allowingReadAccessTo: webDir)
        }

        return webView
    }

    func updateUIView(_ uiView: WKWebView, context: Context) {}
}
