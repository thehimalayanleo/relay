import AppKit
import Foundation
import UniformTypeIdentifiers

enum TransferState: String, Codable {
    case captured = "CAPTURED"
    case borrowed = "BORROWED"
    case shared = "SHARED"
    case received = "RECEIVED"
}

struct TransferSpace: Codable, Equatable, Identifiable {
    var id: UUID
    var campSpaceId: UUID
    var source: String
    var destination: String
    var state: TransferState
    var digest: String
    var preview: String
    var createdAt: Date
}

@MainActor
final class PassOnModel: ObservableObject {
    @Published var isExpanded = false
    @Published var destination: Destination = .claude
    @Published var sourceApp = "Clipboard"
    @Published var capturedText = ""
    @Published var notice = "Copy useful context in any app, then open Relay."
    @Published var isWorking = false
    @Published var serviceAvailable = false
    @Published var serviceMode = "LOCAL"
    @Published var lastShareURL: URL?
    @Published var importedCapsule: PassOnCapsule?
    @Published var activeCapsule: PassOnCapsule?
    @Published var recentSpaces: [TransferSpace] = []

    var previousAppProvider: () -> String = { "Clipboard" }
    var shareHandler: ((URL) -> Void)?
    var sizeHandler: ((Bool) -> Void)?

    private let serviceBaseURL = URL(string: "http://127.0.0.1:4317")!
    private let spacesDefaultsKey = "passon.transfer-spaces.v1"

    init() {
        loadSpaces()
    }

    var capsule: PassOnCapsule? {
        importedCapsule ?? activeCapsule
    }

    var preview: String {
        let cleaned = capturedText.trimmingCharacters(in: .whitespacesAndNewlines)
        if cleaned.isEmpty { return "No context captured yet." }
        return cleaned.replacingOccurrences(of: "\n", with: " ")
    }

    var contextSize: String {
        let count = capturedText.count
        if count >= 1_000 { return String(format: "%.1fk chars", Double(count) / 1_000) }
        return "\(count) chars"
    }

    func toggle() {
        isExpanded.toggle()
        sizeHandler?(isExpanded)
        if isExpanded { captureClipboard(silent: true) }
    }

    func captureClipboard(silent: Bool = false) {
        sourceApp = previousAppProvider()
        guard let text = NSPasteboard.general.string(forType: .string),
              !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            if !silent { notice = "Clipboard is empty. Copy context in the source app first." }
            return
        }
        importedCapsule = nil
        capturedText = text
        activeCapsule = PassOnCapsule.fromClipboard(text, sourceApp: sourceApp, destination: destination)
        notice = "Captured from \(sourceApp). Nothing has been sent."
        Task { await checkService() }
    }

    func selectDestination(_ value: Destination) {
        destination = value
        activeCapsule?.intendedRecipient = value.rawValue
        importedCapsule?.intendedRecipient = value.rawValue
    }

    func copyForDestination(openApp: Bool = true) {
        guard let capsule else {
            notice = "Copy context in another app, then capture it here."
            return
        }
        let rendered = CapsuleRenderer.render(capsule, for: destination)
        NSPasteboard.general.clearContents()
        NSPasteboard.general.setString(rendered, forType: .string)
        recordSpace(capsule, state: .borrowed)
        notice = "Copied for \(destination.rawValue). Paste it into the destination."
        if openApp { launch(destination) }
        Task { await publishToService(capsule, copyLink: false) }
    }

    func createShareLink() {
        guard let capsule else {
            notice = "Capture context before creating a handoff link."
            return
        }
        guard serviceAvailable else {
            notice = "Start Relay Core, then try again."
            return
        }
        Task { await publishToService(capsule, copyLink: true) }
    }

    func shareCapsule() {
        guard let capsule else {
            notice = "Capture context before creating a portable capsule."
            return
        }
        do {
            let encoder = JSONEncoder()
            encoder.dateEncodingStrategy = .iso8601
            encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
            let data = try encoder.encode(capsule)
            let safeTitle = capsule.title
                .lowercased()
                .replacingOccurrences(of: "[^a-z0-9]+", with: "-", options: .regularExpression)
                .trimmingCharacters(in: CharacterSet(charactersIn: "-"))
            let url = FileManager.default.temporaryDirectory
                .appendingPathComponent(safeTitle.isEmpty ? "borrowed-context" : safeTitle)
                .appendingPathExtension("passon")
            try data.write(to: url, options: .atomic)
            recordSpace(capsule, state: .shared)
            notice = "Portable capsule ready. Choose a destination or save it."
            shareHandler?(url)
        } catch {
            notice = "Could not create capsule: \(error.localizedDescription)"
        }
    }

    func importCapsule() {
        let panel = NSOpenPanel()
        panel.allowedContentTypes = [UTType(filenameExtension: "passon") ?? .json, .json]
        panel.allowsMultipleSelection = false
        panel.canChooseDirectories = false
        panel.message = "Open a .passon capsule received from another person or laptop."
        if panel.runModal() == .OK, let url = panel.url {
            loadCapsule(from: url)
        }
    }

    func loadCapsule(from url: URL) {
        do {
            let decoder = JSONDecoder()
            decoder.dateDecodingStrategy = .iso8601
            let decoded = try decoder.decode(PassOnCapsule.self, from: Data(contentsOf: url))
            importedCapsule = decoded
            activeCapsule = nil
            capturedText = decoded.traceSummary
            sourceApp = decoded.source.harness
            destination = Destination(rawValue: decoded.intendedRecipient) ?? .claude
            isExpanded = true
            sizeHandler?(true)
            recordSpace(decoded, state: .received)
            notice = "Received capsule verified locally: sha256:\(decoded.digest.prefix(10))…"
        } catch {
            notice = "Could not open this capsule: \(error.localizedDescription)"
        }
    }

    private func recordSpace(_ capsule: PassOnCapsule, state: TransferState) {
        let item = TransferSpace(
            id: UUID(),
            campSpaceId: capsule.camp?.spaceId ?? UUID(),
            source: capsule.source.harness,
            destination: destination.rawValue,
            state: state,
            digest: capsule.digest,
            preview: String(capsule.traceSummary.replacingOccurrences(of: "\n", with: " ").prefix(100)),
            createdAt: Date()
        )
        recentSpaces.removeAll { $0.campSpaceId == item.campSpaceId && $0.state == state }
        recentSpaces.insert(item, at: 0)
        recentSpaces = Array(recentSpaces.prefix(8))
        saveSpaces()
    }

    private func loadSpaces() {
        guard let data = UserDefaults.standard.data(forKey: spacesDefaultsKey) else { return }
        recentSpaces = (try? JSONDecoder().decode([TransferSpace].self, from: data)) ?? []
    }

    private func saveSpaces() {
        guard let data = try? JSONEncoder().encode(recentSpaces) else { return }
        UserDefaults.standard.set(data, forKey: spacesDefaultsKey)
    }

    private func launch(_ destination: Destination) {
        for path in destination.applicationPaths where FileManager.default.fileExists(atPath: path) {
            NSWorkspace.shared.openApplication(
                at: URL(fileURLWithPath: path),
                configuration: NSWorkspace.OpenConfiguration()
            )
            return
        }
    }

    private func checkService() async {
        do {
            let (data, response) = try await URLSession.shared.data(from: serviceBaseURL.appendingPathComponent("health"))
            serviceAvailable = (response as? HTTPURLResponse)?.statusCode == 200
            if serviceAvailable, let health = try? JSONDecoder().decode(ServiceHealthResponse.self, from: data) {
                serviceMode = health.workPod.provider == "sail" ? "SAIL" : "CORE"
            }
        } catch {
            serviceAvailable = false
            serviceMode = "LOCAL"
        }
    }

    private func publishToService(_ capsule: PassOnCapsule, copyLink: Bool) async {
        guard serviceAvailable else { return }
        isWorking = true
        defer { isWorking = false }
        do {
            var request = URLRequest(url: serviceBaseURL.appendingPathComponent("v1/passons"))
            request.httpMethod = "POST"
            request.setValue("application/json", forHTTPHeaderField: "content-type")
            request.httpBody = try JSONEncoder().encode(ServiceCreateRequest(
                capsule: ServiceCapsule(capsule),
                ttlHours: 72,
                workPod: ServiceWorkPodRequest(requested: true)
            ))
            let (data, response) = try await URLSession.shared.data(for: request)
            guard (response as? HTTPURLResponse)?.statusCode == 201 else { return }
            let created = try JSONDecoder().decode(ServiceCreateResponse.self, from: data)
            lastShareURL = URL(string: created.shareUrl)
            if copyLink, let lastShareURL {
                NSPasteboard.general.clearContents()
                NSPasteboard.general.setString(lastShareURL.absoluteString, forType: .string)
                recordSpace(capsule, state: .shared)
                notice = "Handoff link and work pod copied."
            }
        } catch {
            serviceAvailable = false
            notice = "Relay Core could not create the handoff."
        }
    }
}
