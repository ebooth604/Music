import Foundation

/// Decoded form of providers/<id>.json — the hot-swappable selector map for Browser Mode.
public struct ProviderConfig: Codable, Sendable {
    public struct LoggedInCheck: Codable, Sendable { public var selector: String; public var loggedOutUrlPattern: String }
    public struct Step: Codable, Sendable {
        public var url: String?
        public var selector: String?
        public var clearFirst: Bool?
        public var fileInput: String?
        public var dropTarget: String?
        public var openSelector: String?
        public var optionSelectorTemplate: String?
        public var progressSelector: String?
        public var timeoutSeconds: Int?
        public var pollSeconds: Int?
        public var videoSelector: String?
        public var downloadButton: String?
    }
    public struct Blockers: Codable, Sendable { public var captcha: [String]; public var dialogs: [String] }
    public struct RateLimit: Codable, Sendable { public var maxConcurrent: Int; public var minSecondsBetweenSubmits: Int; public var queueFullSelector: String?; public var backoffSeconds: Int }

    public var providerId: ProviderId
    public var version: Int
    public var baseUrl: String
    public var loggedInCheck: LoggedInCheck
    public var steps: [String: Step]
    public var blockers: Blockers
    public var rateLimit: RateLimit

    public func step(_ name: String) throws -> Step {
        guard let s = steps[name] else { throw ClipGeneratorError.failed("provider config missing step \(name)") }
        return s
    }
}

public enum ProviderConfigLoader {
    /// User override dir wins over the bundled copy so selectors can be patched without an app update.
    public static var overrideDirectory: URL {
        let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        return base.appending(path: "LongForm/providers")
    }

    public static func load(_ id: ProviderId, bundle: Bundle) throws -> ProviderConfig {
        let override = overrideDirectory.appending(path: "\(id.rawValue).json")
        let url = FileManager.default.fileExists(atPath: override.path) ? override
            : bundle.url(forResource: id.rawValue, withExtension: "json", subdirectory: "providers")
        guard let url else { throw ClipGeneratorError.failed("no provider config for \(id.rawValue)") }
        return try JSONDecoder().decode(ProviderConfig.self, from: Data(contentsOf: url))
    }
}
