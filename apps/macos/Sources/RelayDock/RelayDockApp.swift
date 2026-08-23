import SwiftUI

@main
struct RelayDockApp: App {
    @NSApplicationDelegateAdaptor(RelayAppDelegate.self) private var appDelegate

    var body: some Scene {
        Settings {
            EmptyView()
        }
    }
}
