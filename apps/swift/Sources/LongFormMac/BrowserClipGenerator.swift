import Foundation
import LongFormKit

/// Browser-Mode implementation of `ClipGenerator`: one class for every provider, parameterised by
/// the provider's JSON selector config. Steps: check login → open generator → upload start frame →
/// type prompt → set duration/ratio → Generate → wait → download → extract last frame.
@MainActor
public final class BrowserClipGenerator: ClipGenerator {
    public let providerId: ProviderId
    public let mode: GenerationMode = .browser
    public let supportsStartFrame = true

    private let config: ProviderConfig
    private let driver: BrowserDriver
    private let ffmpeg: FFmpeg
    private var lastSubmit = Date.distantPast
    private let workDir: URL

    public init(config: ProviderConfig, driver: BrowserDriver, ffmpeg: FFmpeg, workDir: URL) {
        self.providerId = config.providerId; self.config = config; self.driver = driver; self.ffmpeg = ffmpeg; self.workDir = workDir
    }

    public func generateClip(_ req: GenerateClipRequest) async throws -> GenerateClipResult {
        try await ensureLoggedIn()
        try await throttle()

        let open = try config.step("openGenerator")
        try await driver.navigate(URL(string: open.url ?? config.baseUrl)!)
        try await checkBlockers()

        if let start = req.startFrame {
            let up = try config.step("uploadStartFrame")
            let data = try Data(contentsOf: start)
            try await driver.setFile(up.fileInput ?? "input[type='file']", data: data, filename: "start.png", mime: "image/png")
        }

        let pb = try config.step("promptBox")
        try await driver.type(pb.selector!, text: req.prompt, clearFirst: pb.clearFirst ?? true)

        try await choose(step: "setDuration", value: "\(req.duration)", token: "{{seconds}}")
        try await choose(step: "setAspectRatio", value: req.aspectRatio.rawValue, token: "{{ratio}}")

        try await checkBlockers()
        let gen = try config.step("generate")
        try await driver.click(gen.selector!)
        lastSubmit = Date()

        if let full = config.rateLimit.queueFullSelector, try await driver.exists(full) {
            throw ClipGeneratorError.rateLimited(retryAfterSeconds: config.rateLimit.backoffSeconds)
        }

        let wait = try config.step("waitForCompletion")
        try await driver.waitFor(wait.selector!, timeout: TimeInterval(wait.timeoutSeconds ?? 900), poll: TimeInterval(wait.pollSeconds ?? 5),
                                 blockers: config.blockers.captcha + config.blockers.dialogs)

        let dl = try config.step("download")
        guard let src = try await driver.attr(dl.videoSelector!, "src"), !src.isEmpty else { throw ClipGeneratorError.selectorNotFound(dl.videoSelector!) }
        let bytes = try await driver.fetchBytes(src)
        let clip = workDir.appending(path: "clip_\(UUID().uuidString).mp4")
        try bytes.write(to: clip)
        let last = try await ffmpeg.extractLastFrame(of: clip)
        return GenerateClipResult(clipFile: clip, lastFrameFile: last, meta: ["providerId": providerId.rawValue, "sourceUrl": src])
    }

    public func testConnection() async throws -> String {
        try await ensureLoggedIn()
        try await driver.navigate(URL(string: config.baseUrl)!)
        let pb = try config.step("promptBox")
        try await driver.type(pb.selector!, text: "A single red balloon drifting across a clear blue sky.", clearFirst: true)
        let gen = try config.step("generate")
        guard try await driver.exists(gen.selector!) else { throw ClipGeneratorError.selectorNotFound(gen.selector!) }
        return "Signed in to \(providerId.displayName); prompt box and Generate button found. Browser Mode is ready."
    }

    // MARK: helpers
    private func ensureLoggedIn() async throws {
        try await driver.navigate(URL(string: config.baseUrl)!)
        if driver.currentURL.contains(config.loggedInCheck.loggedOutUrlPattern) || !(try await driver.exists(config.loggedInCheck.selector)) {
            throw ClipGeneratorError.notLoggedIn(providerId)   // never type credentials: user signs in inside the app window
        }
    }
    private func throttle() async throws {
        let gap = TimeInterval(config.rateLimit.minSecondsBetweenSubmits) - Date().timeIntervalSince(lastSubmit)
        if gap > 0 { try await Task.sleep(for: .seconds(gap)) }
    }
    private func checkBlockers() async throws {
        if let d = driver.unexpectedDialog { throw ClipGeneratorError.needsUserIntervention("dialog: \(d)") }
        if let b = try await driver.anyExists(config.blockers.captcha) { throw ClipGeneratorError.needsUserIntervention("captcha (\(b))") }
        if let b = try await driver.anyExists(config.blockers.dialogs) { throw ClipGeneratorError.needsUserIntervention("dialog (\(b))") }
    }
    private func choose(step name: String, value: String, token: String) async throws {
        guard let s = config.steps[name], let open = s.openSelector, let tmpl = s.optionSelectorTemplate else { return } // optional on some sites
        if try await driver.exists(open) {
            try await driver.click(open)
            let opt = tmpl.replacingOccurrences(of: token, with: value)
            if try await driver.exists(opt) { try await driver.click(opt) }
        }
    }
}
