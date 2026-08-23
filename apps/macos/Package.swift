// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "RelayDock",
    platforms: [.macOS(.v14)],
    products: [
        .executable(name: "RelayDock", targets: ["RelayDock"]),
    ],
    targets: [
        .executableTarget(name: "RelayDock"),
        .testTarget(name: "RelayDockTests", dependencies: ["RelayDock"]),
    ],
    swiftLanguageModes: [.v5]
)
