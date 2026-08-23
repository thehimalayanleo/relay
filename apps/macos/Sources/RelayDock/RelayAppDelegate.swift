import AppKit
import SwiftUI

@MainActor
final class RelayAppDelegate: NSObject, NSApplicationDelegate {
    private let model = RelayModel()
    private var panel: NSPanel?
    private var lastExternalApplication = "Clipboard"
    private var activationObserver: NSObjectProtocol?

    func applicationDidFinishLaunching(_ notification: Notification) {
        NSApp.setActivationPolicy(.accessory)
        observeApplications()
        configureModel()
        createPanel()
    }

    func applicationWillTerminate(_ notification: Notification) {
        if let activationObserver {
            NSWorkspace.shared.notificationCenter.removeObserver(activationObserver)
        }
    }

    func application(_ application: NSApplication, open urls: [URL]) {
        guard let first = urls.first else { return }
        model.loadCapsule(from: first)
        panel?.orderFrontRegardless()
    }

    private func observeApplications() {
        activationObserver = NSWorkspace.shared.notificationCenter.addObserver(
            forName: NSWorkspace.didActivateApplicationNotification,
            object: nil,
            queue: .main
        ) { [weak self] notification in
            guard let application = notification.userInfo?[NSWorkspace.applicationUserInfoKey] as? NSRunningApplication,
                  application.bundleIdentifier != Bundle.main.bundleIdentifier else { return }
            Task { @MainActor in
                self?.lastExternalApplication = application.localizedName ?? "Clipboard"
            }
        }
    }

    private func configureModel() {
        model.previousAppProvider = { [weak self] in self?.lastExternalApplication ?? "Clipboard" }
        model.sizeHandler = { [weak self] expanded in self?.resizePanel(expanded: expanded) }
        model.shareHandler = { [weak self] url in self?.showSharePicker(for: url) }
    }

    private func createPanel() {
        let size = NSSize(width: 62, height: 62)
        let panel = NSPanel(
            contentRect: NSRect(origin: .zero, size: size),
            styleMask: [.borderless, .nonactivatingPanel],
            backing: .buffered,
            defer: false
        )
        panel.level = .floating
        panel.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary, .stationary]
        panel.isOpaque = false
        panel.backgroundColor = .clear
        panel.hasShadow = true
        panel.hidesOnDeactivate = false
        panel.isMovableByWindowBackground = true
        panel.contentView = NSHostingView(rootView: RelayRootView(model: model))
        panel.setFrameOrigin(defaultOrigin(for: size))
        panel.orderFrontRegardless()
        self.panel = panel
    }

    private func resizePanel(expanded: Bool) {
        guard let panel else { return }
        let newSize = expanded ? NSSize(width: 370, height: 570) : NSSize(width: 62, height: 62)
        let screen = panel.screen ?? NSScreen.main
        let visibleFrame = screen?.visibleFrame ?? .zero
        let topRight = NSPoint(x: panel.frame.maxX, y: panel.frame.maxY)
        var frame = NSRect(
            x: topRight.x - newSize.width,
            y: topRight.y - newSize.height,
            width: newSize.width,
            height: newSize.height
        )
        if !visibleFrame.contains(frame) {
            frame.origin = defaultOrigin(for: newSize)
        }
        panel.setFrame(frame, display: true, animate: true)
        panel.orderFrontRegardless()
    }

    private func defaultOrigin(for size: NSSize) -> NSPoint {
        let visibleFrame = NSScreen.main?.visibleFrame ?? NSRect(x: 0, y: 0, width: 1440, height: 900)
        return NSPoint(
            x: visibleFrame.maxX - size.width - 24,
            y: visibleFrame.maxY - size.height - 52
        )
    }

    private func showSharePicker(for url: URL) {
        guard let contentView = panel?.contentView else { return }
        let picker = NSSharingServicePicker(items: [url])
        picker.show(relativeTo: contentView.bounds, of: contentView, preferredEdge: .minY)
    }
}
