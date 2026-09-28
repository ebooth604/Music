import Foundation

/// Swift mirror of `ClipGenerator` in packages/shared/src/adapter.ts.
/// Browser-Mode adapters (macOS) implement this once per provider; the worker loop only ever sees this protocol.
public struct GenerateClipRequest: Sendable {
    public var prompt: String
    public var startFrame: URL?
    public var duration: Int
    public var aspectRatio: AspectRatio
    public init(prompt: String, startFrame: URL? = nil, duration: Int, aspectRatio: AspectRatio) {
        self.prompt = prompt; self.startFrame = startFrame; self.duration = duration; self.aspectRatio = aspectRatio
    }
}

public struct GenerateClipResult: Sendable {
    /// Local file URL of the downloaded clip (the worker uploads it to shared storage afterwards).
    public var clipFile: URL
    public var lastFrameFile: URL?
    public var meta: [String: String]
    public init(clipFile: URL, lastFrameFile: URL? = nil, meta: [String: String] = [:]) { self.clipFile = clipFile; self.lastFrameFile = lastFrameFile; self.meta = meta }
}

public enum ClipGeneratorError: Error, LocalizedError, Sendable {
    /// A captcha or unexpected dialog appeared: the job is parked until the user intervenes.
    case needsUserIntervention(String)
    case notLoggedIn(ProviderId)
    case rateLimited(retryAfterSeconds: Int)
    case selectorNotFound(String)
    case timeout(String)
    case failed(String)
    public var errorDescription: String? {
        switch self {
        case .needsUserIntervention(let s): "Needs your attention: \(s)"
        case .notLoggedIn(let p): "Not signed in to \(p.displayName) in the embedded browser"
        case .rateLimited(let s): "Rate limited, retry in \(s)s"
        case .selectorNotFound(let s): "Page changed: could not find \(s) (update providers/*.json)"
        case .timeout(let s): "Timed out: \(s)"
        case .failed(let s): s
        }
    }
}

public protocol ClipGenerator: AnyObject, Sendable {
    var providerId: ProviderId { get }
    var mode: GenerationMode { get }
    var supportsStartFrame: Bool { get }
    func generateClip(_ request: GenerateClipRequest) async throws -> GenerateClipResult
    func testConnection() async throws -> String
}
