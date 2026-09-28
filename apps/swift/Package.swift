// swift-tools-version:5.9
import PackageDescription

// LongFormKit is the shared library (models, API client, adapter protocol, Keychain, shared SwiftUI views).
// The macOS and iOS apps (Sources/LongFormMac, Sources/LongFormiOS) are Xcode app targets generated from
// project.yml with XcodeGen; they depend on this package.
let package = Package(
    name: "LongForm",
    platforms: [.macOS(.v14), .iOS(.v17)],
    products: [.library(name: "LongFormKit", targets: ["LongFormKit"])],
    targets: [
        .target(name: "LongFormKit", path: "Sources/LongFormKit"),
        .testTarget(name: "LongFormKitTests", dependencies: ["LongFormKit"], path: "Tests/LongFormKitTests"),
    ]
)
