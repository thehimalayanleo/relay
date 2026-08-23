import SwiftUI

private let passOnOrange = Color(red: 1.0, green: 90.0 / 255.0, blue: 31.0 / 255.0)

struct PassOnRootView: View {
    @ObservedObject var model: PassOnModel

    var body: some View {
        Group {
            if model.isExpanded {
                expandedView
                    .transition(.opacity.combined(with: .scale(scale: 0.96, anchor: .topTrailing)))
            } else {
                collapsedButton
                    .transition(.opacity.combined(with: .scale(scale: 0.9)))
            }
        }
        .animation(.spring(response: 0.26, dampingFraction: 0.86), value: model.isExpanded)
    }

    private var collapsedButton: some View {
        Button(action: model.toggle) {
            ZStack {
                Circle()
                    .fill(passOnOrange)
                Circle()
                    .strokeBorder(Color.white.opacity(0.16), lineWidth: 1)
                Image(systemName: "arrow.left.arrow.right")
                    .font(.system(size: 21, weight: .semibold))
                    .foregroundStyle(.white)
            }
            .frame(width: 54, height: 54)
            .shadow(color: passOnOrange.opacity(0.30), radius: 16, y: 8)
        }
        .buttonStyle(.plain)
        .help("Relay context")
        .padding(4)
    }

    private var expandedView: some View {
        VStack(spacing: 0) {
            header
            Divider().opacity(0.5)
            VStack(alignment: .leading, spacing: 16) {
                sourceCard
                destinationPicker
                transferSpace
                previewCard
                primaryAction
                transferActions
                statusLine
            }
            .padding(16)
        }
        .background(.ultraThickMaterial)
        .clipShape(RoundedRectangle(cornerRadius: 22, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 22, style: .continuous)
                .strokeBorder(Color.primary.opacity(0.12), lineWidth: 1)
        }
        .shadow(color: .black.opacity(0.28), radius: 28, y: 14)
        .padding(4)
    }

    private var header: some View {
        HStack(spacing: 10) {
            ZStack {
                RoundedRectangle(cornerRadius: 9, style: .continuous)
                    .fill(passOnOrange)
                Image(systemName: "arrow.left.arrow.right")
                    .font(.system(size: 13, weight: .bold))
                    .foregroundStyle(.white)
            }
            .frame(width: 30, height: 30)
            VStack(alignment: .leading, spacing: 1) {
                Text("RELAY")
                    .font(.system(size: 11, weight: .bold, design: .rounded))
                    .tracking(1.2)
                Text("Context port")
                    .font(.system(size: 11))
                    .foregroundStyle(.secondary)
            }
            Spacer()
            HStack(spacing: 5) {
                Circle()
                    .fill(model.serviceAvailable ? Color.green : Color.orange)
                    .frame(width: 6, height: 6)
                Text(model.serviceAvailable ? model.serviceMode : "LOCAL")
                    .font(.system(size: 9, weight: .bold, design: .monospaced))
            }
            .foregroundStyle(.secondary)
            Button(action: model.toggle) {
                Image(systemName: "xmark")
                    .font(.system(size: 10, weight: .bold))
                    .frame(width: 25, height: 25)
                    .background(Color.primary.opacity(0.07), in: Circle())
            }
            .buttonStyle(.plain)
        }
        .padding(16)
    }

    private var sourceCard: some View {
        HStack(spacing: 11) {
            Image(systemName: "doc.on.clipboard")
                .font(.system(size: 15, weight: .semibold))
                .foregroundStyle(passOnOrange)
                .frame(width: 34, height: 34)
                .background(passOnOrange.opacity(0.12), in: RoundedRectangle(cornerRadius: 9))
            VStack(alignment: .leading, spacing: 3) {
                Text("Borrowing from")
                    .font(.system(size: 10, weight: .semibold))
                    .foregroundStyle(.secondary)
                    .textCase(.uppercase)
                Text(model.sourceApp)
                    .font(.system(size: 13, weight: .semibold))
                    .lineLimit(1)
            }
            Spacer()
            Text(model.contextSize)
                .font(.system(size: 10, weight: .medium, design: .monospaced))
                .foregroundStyle(.secondary)
            Button(action: { model.captureClipboard() }) {
                Image(systemName: "arrow.clockwise")
                    .font(.system(size: 11, weight: .bold))
            }
            .buttonStyle(.borderless)
            .help("Capture clipboard again")
        }
        .padding(11)
        .background(Color.primary.opacity(0.055), in: RoundedRectangle(cornerRadius: 13, style: .continuous))
    }

    private var destinationPicker: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("BORROW INTO")
                .font(.system(size: 9, weight: .bold, design: .rounded))
                .tracking(1.1)
                .foregroundStyle(.secondary)
            HStack(spacing: 7) {
                ForEach(Destination.allCases) { destination in
                    Button(action: { model.selectDestination(destination) }) {
                        HStack(spacing: 6) {
                            Image(systemName: destination.symbol)
                            Text(destination.rawValue)
                        }
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundStyle(model.destination == destination ? Color.white : Color.primary)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 9)
                        .background(
                            model.destination == destination ? passOnOrange : Color.primary.opacity(0.055),
                            in: RoundedRectangle(cornerRadius: 10, style: .continuous)
                        )
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }

    private var transferSpace: some View {
        VStack(alignment: .leading, spacing: 9) {
            HStack {
                Text("TRANSFER SPACE")
                    .font(.system(size: 9, weight: .bold, design: .rounded))
                    .tracking(1.1)
                    .foregroundStyle(.secondary)
                Spacer()
                Text("CAMP / H2")
                    .font(.system(size: 8, weight: .bold, design: .monospaced))
                    .foregroundStyle(passOnOrange)
            }
            HStack(spacing: 8) {
                appNode(model.sourceApp, symbol: "square.on.square")
                lineage
                appNode("Work pod", symbol: "shippingbox")
                lineage
                appNode(model.destination.rawValue, symbol: model.destination.symbol)
            }
            if let latest = model.recentSpaces.first {
                HStack(spacing: 6) {
                    Circle()
                        .fill(statusColor(latest.state))
                        .frame(width: 6, height: 6)
                    Text(latest.state.rawValue)
                        .font(.system(size: 8, weight: .bold, design: .monospaced))
                    Text(String(latest.digest.prefix(10)))
                        .font(.system(size: 8, design: .monospaced))
                        .foregroundStyle(.secondary)
                    Spacer()
                    Text("\(model.recentSpaces.count) local")
                        .font(.system(size: 8, weight: .medium, design: .monospaced))
                        .foregroundStyle(.secondary)
                }
            }
        }
        .padding(11)
        .background(passOnOrange.opacity(0.07), in: RoundedRectangle(cornerRadius: 13, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 13, style: .continuous)
                .strokeBorder(passOnOrange.opacity(0.18))
        }
    }

    private func appNode(_ name: String, symbol: String) -> some View {
        VStack(spacing: 4) {
            Image(systemName: symbol)
                .font(.system(size: 11, weight: .semibold))
                .frame(width: 25, height: 25)
                .background(Color.primary.opacity(0.07), in: RoundedRectangle(cornerRadius: 7))
            Text(name)
                .font(.system(size: 8, weight: .semibold))
                .lineLimit(1)
                .frame(width: 66)
        }
    }

    private var lineage: some View {
        HStack(spacing: 0) {
            Circle().fill(passOnOrange).frame(width: 6, height: 6)
            Rectangle().fill(passOnOrange.opacity(0.38)).frame(height: 1)
            ZStack {
                Circle().fill(passOnOrange.opacity(0.15))
                Image(systemName: "arrow.right")
                    .font(.system(size: 8, weight: .bold))
                    .foregroundStyle(passOnOrange)
            }
            .frame(width: 22, height: 22)
            Rectangle().fill(passOnOrange.opacity(0.38)).frame(height: 1)
            Circle().fill(passOnOrange).frame(width: 6, height: 6)
        }
        .frame(maxWidth: .infinity)
    }

    private func statusColor(_ state: TransferState) -> Color {
        switch state {
        case .captured: return passOnOrange
        case .borrowed: return .green
        case .shared: return .blue
        case .received: return passOnOrange
        }
    }

    private var previewCard: some View {
        VStack(alignment: .leading, spacing: 7) {
            HStack {
                Text("CONTEXT PREVIEW")
                    .font(.system(size: 9, weight: .bold, design: .rounded))
                    .tracking(1.1)
                    .foregroundStyle(.secondary)
                Spacer()
                Text("SHA-256")
                    .font(.system(size: 8, weight: .semibold, design: .monospaced))
                    .foregroundStyle(.secondary.opacity(0.7))
            }
            Text(model.preview)
                .font(.system(size: 12, design: .monospaced))
                .foregroundStyle(model.capturedText.isEmpty ? .secondary : .primary)
                .lineLimit(4)
                .frame(maxWidth: .infinity, minHeight: 58, alignment: .topLeading)
        }
        .padding(12)
        .background(Color.white.opacity(0.48), in: RoundedRectangle(cornerRadius: 13, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 13, style: .continuous)
                .strokeBorder(Color.primary.opacity(0.08))
        }
    }

    private var primaryAction: some View {
        Button(action: { model.copyForDestination() }) {
            HStack {
                Image(systemName: "arrow.right.circle.fill")
                Text("Borrow into \(model.destination.rawValue)")
                Spacer()
                Text("⌘V")
                    .font(.system(size: 10, weight: .medium, design: .monospaced))
                    .foregroundStyle(.white.opacity(0.64))
            }
            .font(.system(size: 13, weight: .semibold))
            .foregroundStyle(.white)
            .padding(.horizontal, 14)
            .frame(maxWidth: .infinity, minHeight: 44)
            .background(passOnOrange, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
        }
        .buttonStyle(.plain)
        .disabled(model.capsule == nil)
        .opacity(model.capsule == nil ? 0.48 : 1)
    }

    private var transferActions: some View {
        HStack(spacing: 8) {
            Button(action: model.shareCapsule) {
                Label("Export capsule", systemImage: "square.and.arrow.up")
                    .frame(maxWidth: .infinity)
            }
            Button(action: model.createShareLink) {
                Label("Copy link", systemImage: "link")
                    .frame(maxWidth: .infinity)
            }
            .disabled(!model.serviceAvailable || model.capsule == nil)
            Button(action: model.importCapsule) {
                Label("Open", systemImage: "square.and.arrow.down")
                    .frame(maxWidth: .infinity)
            }
        }
        .buttonStyle(.bordered)
        .controlSize(.small)
    }

    private var statusLine: some View {
        HStack(alignment: .top, spacing: 7) {
            Image(systemName: model.isWorking ? "arrow.triangle.2.circlepath" : "lock.shield")
                .font(.system(size: 10, weight: .semibold))
                .foregroundStyle(.secondary)
            Text(model.notice)
                .font(.system(size: 10))
                .foregroundStyle(.secondary)
                .lineLimit(2)
            Spacer(minLength: 0)
        }
        .frame(minHeight: 24, alignment: .top)
    }
}
