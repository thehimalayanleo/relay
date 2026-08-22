// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "PassOnDock",
    platforms: [.macOS(.v14)],
    products: [
        .executable(name: "PassOnDock", targets: ["PassOnDock"]),
    ],
    targets: [
        .executableTarget(name: "PassOnDock"),
        .testTarget(name: "PassOnDockTests", dependencies: ["PassOnDock"]),
    ],
    swiftLanguageModes: [.v5]
)
