import SwiftUI

@main
struct PassOnDockApp: App {
    @NSApplicationDelegateAdaptor(PassOnAppDelegate.self) private var appDelegate

    var body: some Scene {
        Settings {
            EmptyView()
        }
    }
}
