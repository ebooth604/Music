import Foundation

/// Typed client for openapi/longform.yaml.
public actor APIClient {
    public var baseURL: URL
    private var token: String?
    private let session: URLSession = .shared
    private let enc = JSONEncoder(), dec = JSONDecoder()

    public init(baseURL: URL, token: String? = nil) { self.baseURL = baseURL; self.token = token }
    public func setToken(_ t: String?) { token = t }

    public struct APIError: Error, LocalizedError { public let status: Int; public let message: String; public var errorDescription: String? { "\(status): \(message)" } }

    private func request<T: Decodable>(_ method: String, _ path: String, body: (any Encodable)? = nil) async throws -> T {
        var req = URLRequest(url: baseURL.appending(path: "v1" + path))
        req.httpMethod = method
        req.setValue("application/json", forHTTPHeaderField: "content-type")
        if let token { req.setValue("Bearer \(token)", forHTTPHeaderField: "authorization") }
        if let body { req.httpBody = try enc.encode(AnyEncodable(body)) }
        let (data, resp) = try await session.data(for: req)
        let status = (resp as? HTTPURLResponse)?.statusCode ?? 0
        guard (200..<300).contains(status) else {
            let msg = (try? dec.decode([String: String].self, from: data))?["error"] ?? String(data: data, encoding: .utf8) ?? ""
            throw APIError(status: status, message: msg)
        }
        if T.self == Empty.self { return Empty() as! T }
        return try dec.decode(T.self, from: data)
    }
    public struct Empty: Decodable { public init() {} }
    private struct AnyEncodable: Encodable { let v: any Encodable; init(_ v: any Encodable) { self.v = v }; func encode(to e: Encoder) throws { try v.encode(to: e) } }

    // Auth
    public func signInWithApple(identityToken: String) async throws -> Session { try await request("POST", "/auth/apple", body: ["identityToken": identityToken]) }
    public func requestMagicLink(email: String) async throws { let _: Empty = try await request("POST", "/auth/email/request", body: ["email": email]) }
    public func verifyMagicLink(token: String) async throws -> Session { try await request("POST", "/auth/email/verify", body: ["token": token]) }

    // Projects
    public func listProjects() async throws -> [Project] { try await request("GET", "/projects") }
    public func createProject(prompt: String, settings: ProjectSettings) async throws -> Project {
        struct B: Encodable { let prompt: String; let settings: ProjectSettings }
        return try await request("POST", "/projects", body: B(prompt: prompt, settings: settings))
    }
    public func getProject(_ id: String) async throws -> Project { try await request("GET", "/projects/\(id)") }
    public func saveBible(_ id: String, _ bible: StoryBible) async throws -> Project { try await request("PUT", "/projects/\(id)/bible", body: bible) }
    public func saveSettings(_ id: String, _ s: ProjectSettings) async throws -> Project { try await request("PUT", "/projects/\(id)/settings", body: s) }
    public func replan(_ id: String) async throws { let _: Empty = try await request("POST", "/projects/\(id)/replan") }
    public func approve(_ id: String) async throws -> Project { try await request("POST", "/projects/\(id)/approve") }
    public func pause(_ id: String) async throws -> Project { try await request("POST", "/projects/\(id)/pause") }
    public func resume(_ id: String) async throws -> Project { try await request("POST", "/projects/\(id)/resume") }
    public func shots(_ id: String) async throws -> [Shot] { try await request("GET", "/projects/\(id)/shots") }
    public func progress(_ id: String) async throws -> ProgressSummary { try await request("GET", "/projects/\(id)/progress") }
    public func savePrompt(_ id: String, index: Int, prompt: String) async throws -> Shot { try await request("PUT", "/projects/\(id)/shots/\(index)/prompt", body: ["prompt": prompt]) }
    public func regenerate(_ id: String, index: Int, keepPrompt: Bool = true) async throws -> Shot { try await request("POST", "/projects/\(id)/shots/\(index)/regenerate", body: ["keepPrompt": keepPrompt]) }
    public func acceptShot(_ id: String, index: Int) async throws -> Shot { try await request("POST", "/projects/\(id)/shots/\(index)/accept") }

    // Providers
    public func providers() async throws -> [ProviderSetting] { try await request("GET", "/providers") }
    public func saveProvider(_ p: ProviderId, mode: GenerationMode?, apiKey: String??) async throws {
        struct B: Encodable { var mode: GenerationMode?; var apiKey: String?; var clearKey: Bool
            func encode(to e: Encoder) throws { var c = e.container(keyedBy: K.self); try c.encodeIfPresent(mode, forKey: .mode); if clearKey { try c.encodeNil(forKey: .apiKey) } else { try c.encodeIfPresent(apiKey, forKey: .apiKey) } }
            enum K: CodingKey { case mode, apiKey } }
        let _: Empty = try await request("PUT", "/providers/\(p.rawValue)", body: B(mode: mode, apiKey: apiKey ?? nil, clearKey: apiKey == .some(nil)))
    }
    public struct TestResult: Decodable { public let ok: Bool; public let message: String }
    public func testProvider(_ p: ProviderId, mode: GenerationMode? = nil) async throws -> TestResult { try await request("POST", "/providers/\(p.rawValue)/test", body: ["mode": mode?.rawValue]) }

    // Worker sync
    public struct RegisterResponse: Decodable { public let workerId: String }
    public func registerWorker(workerId: String?, name: String, providers: [ProviderId]) async throws -> RegisterResponse {
        struct B: Encodable { let workerId: String?; let name: String; let providers: [String] }
        return try await request("POST", "/workers/register", body: B(workerId: workerId, name: name, providers: providers.map(\.rawValue)))
    }
    public func pullJob(workerId: String, providers: [ProviderId]) async throws -> BrowserJob? {
        struct B: Encodable { let providers: [String] }
        var req = URLRequest(url: baseURL.appending(path: "v1/workers/\(workerId)/pull"))
        req.httpMethod = "POST"; req.setValue("application/json", forHTTPHeaderField: "content-type")
        if let token { req.setValue("Bearer \(token)", forHTTPHeaderField: "authorization") }
        req.httpBody = try enc.encode(B(providers: providers.map(\.rawValue)))
        let (data, _) = try await session.data(for: req)
        if data == Data("null".utf8) || data.isEmpty { return nil }
        return try dec.decode(BrowserJob.self, from: data)
    }
    public struct UploadTarget: Decodable { public let uploadUrl: String; public let publicUrl: String }
    public func uploadURL(workerId: String, jobId: String, kind: String) async throws -> UploadTarget { try await request("POST", "/workers/\(workerId)/jobs/\(jobId)/upload-url", body: ["kind": kind]) }
    public func completeJob(workerId: String, jobId: String, result: BrowserJobResult) async throws { let _: Empty = try await request("POST", "/workers/\(workerId)/jobs/\(jobId)/complete", body: result) }
    public func failJob(workerId: String, jobId: String, error: String, paused: Bool) async throws {
        struct B: Encodable { let error: String; let paused: Bool }
        let _: Empty = try await request("POST", "/workers/\(workerId)/jobs/\(jobId)/fail", body: B(error: error, paused: paused))
    }
    public func requeueJob(workerId: String, jobId: String) async throws { let _: Empty = try await request("POST", "/workers/\(workerId)/jobs/\(jobId)/requeue") }

    /// PUT a local file to a presigned URL.
    public func upload(file: URL, to presigned: String, contentType: String) async throws {
        var req = URLRequest(url: URL(string: presigned)!)
        req.httpMethod = "PUT"; req.setValue(contentType, forHTTPHeaderField: "content-type")
        let (_, resp) = try await session.upload(for: req, fromFile: file)
        guard let s = (resp as? HTTPURLResponse)?.statusCode, (200..<300).contains(s) else { throw APIError(status: (resp as? HTTPURLResponse)?.statusCode ?? 0, message: "upload failed") }
    }
}
