import Foundation
import SwiftUI

/// Shared observable state for both apps: session, backend URL, project cache.
@MainActor
public final class AppState: ObservableObject {
    @Published public var token: String? { didSet { token.map { try? Keychain.set($0, for: Keychain.sessionToken) } ?? Keychain.delete(Keychain.sessionToken); Task { await api.setToken(token) } } }
    @Published public var baseURL: URL { didSet { UserDefaults.standard.set(baseURL.absoluteString, forKey: "api.baseURL"); api = APIClient(baseURL: baseURL, token: token) } }
    @Published public var projects: [Project] = []
    @Published public var lastError: String?
    public private(set) var api: APIClient

    public init() {
        let url = URL(string: UserDefaults.standard.string(forKey: "api.baseURL") ?? "http://localhost:4000")!
        let tok = Keychain.get(Keychain.sessionToken)
        baseURL = url; token = tok
        api = APIClient(baseURL: url, token: tok)
    }
    public var signedIn: Bool { token != nil }

    public func signInWithApple(identityToken: String) async {
        do { token = try await api.signInWithApple(identityToken: identityToken).token } catch { lastError = error.localizedDescription }
    }
    public func verifyMagicLink(_ t: String) async {
        do { token = try await api.verifyMagicLink(token: t).token } catch { lastError = error.localizedDescription }
    }
    public func refreshProjects() async { do { projects = try await api.listProjects() } catch { lastError = error.localizedDescription } }
}
