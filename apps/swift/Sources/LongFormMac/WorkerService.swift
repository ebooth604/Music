import Foundation
import LongFormKit

/// The local Browser-Mode worker. Registers with the backend, pulls jobs for the providers the user
/// enabled, runs them through `BrowserClipGenerator`, uploads the clip + last frame to shared storage
/// and reports completion. Pauses (and surfaces the job in the UI) when a captcha / dialog appears.
@MainActor
public final class WorkerService: ObservableObject {
    @Published public private(set) var status = "idle"
    @Published public private(set) var currentJob: BrowserJob?
    @Published public private(set) var pausedJob: (job: BrowserJob, reason: String)?
    @Published public var enabledProviders: Set<ProviderId> = [] { didSet { UserDefaults.standard.set(enabledProviders.map(\.rawValue), forKey: "worker.providers") } }
    @Published public private(set) var log: [String] = []

    public let api: APIClient
    public let driver: BrowserDriver
    private let ffmpeg = FFmpeg()
    private var workerId: String? = UserDefaults.standard.string(forKey: "worker.id")
    private var loop: Task<Void, Never>?
    private let workDir: URL = {
        let d = FileManager.default.temporaryDirectory.appending(path: "LongFormWorker"); try? FileManager.default.createDirectory(at: d, withIntermediateDirectories: true); return d
    }()

    public init(api: APIClient, driver: BrowserDriver) {
        self.api = api; self.driver = driver
        enabledProviders = Set((UserDefaults.standard.stringArray(forKey: "worker.providers") ?? []).compactMap(ProviderId.init(rawValue:)))
    }

    public func start() {
        guard loop == nil else { return }
        loop = Task { [weak self] in await self?.runLoop() }
    }
    public func stop() { loop?.cancel(); loop = nil; status = "stopped" }

    /// User solved the captcha / dismissed the dialog in the embedded browser: put the job back.
    public func resumePaused() async {
        guard let p = pausedJob, let workerId else { return }
        driver.clearDialog()
        try? await api.requeueJob(workerId: workerId, jobId: p.job.id)
        pausedJob = nil
    }

    public func testConnection(_ p: ProviderId) async -> String {
        do { return try await generator(for: p).testConnection() } catch { return error.localizedDescription }
    }

    private func generator(for p: ProviderId) throws -> BrowserClipGenerator {
        BrowserClipGenerator(config: try ProviderConfigLoader.load(p, bundle: .main), driver: driver, ffmpeg: ffmpeg, workDir: workDir)
    }

    private func runLoop() async {
        while !Task.isCancelled {
            do {
                let providers = Array(enabledProviders)
                if providers.isEmpty { status = "no providers enabled"; try await Task.sleep(for: .seconds(5)); continue }
                let reg = try await api.registerWorker(workerId: workerId, name: Host.current().localizedName ?? "Mac", providers: providers)
                workerId = reg.workerId; UserDefaults.standard.set(reg.workerId, forKey: "worker.id")
                if pausedJob != nil { status = "paused – needs you"; try await Task.sleep(for: .seconds(5)); continue }
                status = "waiting for jobs"
                guard let job = try await api.pullJob(workerId: reg.workerId, providers: providers) else { try await Task.sleep(for: .seconds(4)); continue }
                await run(job, workerId: reg.workerId)
            } catch {
                append("loop error: \(error.localizedDescription)")
                try? await Task.sleep(for: .seconds(10))
            }
        }
    }

    private func run(_ job: BrowserJob, workerId: String) async {
        currentJob = job; status = "generating shot for \(job.providerId.displayName)"
        defer { currentJob = nil }
        do {
            var start: URL?
            if let s = job.startFrameUrl, let u = URL(string: s) {
                let (data, _) = try await URLSession.shared.data(from: u)
                start = workDir.appending(path: "start_\(job.id).png"); try data.write(to: start!)
            }
            let gen = try generator(for: job.providerId)
            let result = try await gen.generateClip(GenerateClipRequest(prompt: job.prompt, startFrame: start, duration: job.duration, aspectRatio: job.aspectRatio))

            let clipTarget = try await api.uploadURL(workerId: workerId, jobId: job.id, kind: "clip")
            try await api.upload(file: result.clipFile, to: clipTarget.uploadUrl, contentType: "video/mp4")
            var lastUrl: String?
            if let lf = result.lastFrameFile {
                let t = try await api.uploadURL(workerId: workerId, jobId: job.id, kind: "lastFrame")
                try await api.upload(file: lf, to: t.uploadUrl, contentType: "image/png"); lastUrl = t.publicUrl
            }
            try await api.completeJob(workerId: workerId, jobId: job.id, result: BrowserJobResult(clipUrl: clipTarget.publicUrl, lastFrameUrl: lastUrl, meta: result.meta))
            append("✓ shot \(job.shotId.prefix(8)) uploaded")
        } catch let e as ClipGeneratorError {
            switch e {
            case .needsUserIntervention, .notLoggedIn:
                let reason = e.errorDescription ?? "needs attention"
                pausedJob = (job, reason)
                try? await api.failJob(workerId: workerId, jobId: job.id, error: reason, paused: true)
                append("⏸ paused: \(reason)")
            case .rateLimited(let s):
                append("rate limited; backing off \(s)s")
                try? await api.failJob(workerId: workerId, jobId: job.id, error: "rate limited", paused: false)
                try? await Task.sleep(for: .seconds(s))
            default:
                try? await api.failJob(workerId: workerId, jobId: job.id, error: e.localizedDescription, paused: false)
                append("✗ \(e.localizedDescription)")
            }
        } catch {
            try? await api.failJob(workerId: workerId, jobId: job.id, error: error.localizedDescription, paused: false)
            append("✗ \(error.localizedDescription)")
        }
    }

    private func append(_ s: String) { log.append("\(Date().formatted(date: .omitted, time: .standard))  \(s)"); if log.count > 200 { log.removeFirst() } }
}
