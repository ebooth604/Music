import SwiftUI
import LongFormKit

/// macOS app: full UI + the local Browser-Mode worker (embedded WKWebView with the user's sessions)
/// + on-device ffmpeg assembly.
@main
struct LongFormMacApp: App {
    @StateObject private var app: AppState
    @StateObject private var worker: WorkerService

    init() {
        let state = AppState()
        _app = StateObject(wrappedValue: state)
        _worker = StateObject(wrappedValue: WorkerService(api: state.api, driver: BrowserDriver()))
    }

    var body: some Scene {
        WindowGroup("LongForm") {
            if app.signedIn { MainWindow().environmentObject(app).environmentObject(worker).onAppear { worker.start() } }
            else { SignInView().environmentObject(app) }
        }
        Window("Browser Worker", id: "worker") { WorkerWindow().environmentObject(worker) }
    }
}

enum Route: Hashable { case new, bible(Project), progress(String), result(String), settings, worker }

struct MainWindow: View {
    @EnvironmentObject var app: AppState
    @EnvironmentObject var worker: WorkerService
    @State private var route: Route = .new
    @Environment(\.openWindow) var openWindow
    var body: some View {
        NavigationSplitView {
            List(selection: $route) {
                Label("New", systemImage: "plus").tag(Route.new)
                Label("Settings", systemImage: "gear").tag(Route.settings)
                Label("Browser worker: \(worker.status)", systemImage: "globe").tag(Route.worker)
                Section("Projects") {
                    ForEach(app.projects) { p in
                        HStack { Text(p.title).lineLimit(1); Spacer(); StatusBadge(p.status.rawValue) }
                            .tag(p.status == .complete ? Route.result(p.id) : [.draft, .planning, .bible_ready].contains(p.status) ? Route.bible(p) : Route.progress(p.id))
                    }
                }
            }.task { await app.refreshProjects() }
        } detail: {
            switch route {
            case .new: NewProjectView { p in Task { await app.refreshProjects() }; route = .bible(p) }
            case .bible(let p): StoryBibleView(project: p) { p in route = .progress(p.id) }
            case .progress(let id): ShotProgressView(projectId: id)
            case .result(let id): ResultView(projectId: id)
            case .settings: ProviderSettingsView(browserTest: { p in await worker.testConnection(p) })
            case .worker: WorkerWindow()
            }
        }.frame(minWidth: 1000, minHeight: 680)
    }
}

/// Shows the embedded browser so the user can sign in to each provider (we never handle credentials)
/// and solve captchas / dismiss dialogs when a job pauses.
struct WorkerWindow: View {
    @EnvironmentObject var worker: WorkerService
    var body: some View {
        HSplitView {
            VStack(alignment: .leading, spacing: 10) {
                Text("Browser Mode worker").font(.headline)
                Text(worker.status).foregroundStyle(.secondary)
                ForEach(ProviderId.allCases) { p in
                    Toggle(p.displayName, isOn: Binding(get: { worker.enabledProviders.contains(p) }, set: { on in if on { worker.enabledProviders.insert(p) } else { worker.enabledProviders.remove(p) } }))
                }
                if let paused = worker.pausedJob {
                    GroupBox("Needs you") {
                        Text(paused.reason).font(.caption)
                        Text("Solve the captcha / sign in / close the dialog in the browser on the right, then:").font(.caption).foregroundStyle(.secondary)
                        Button("I fixed it — resume") { Task { await worker.resumePaused() } }.buttonStyle(.borderedProminent)
                    }
                }
                Text("Log").font(.caption.bold())
                ScrollView { VStack(alignment: .leading) { ForEach(worker.log.reversed(), id: \.self) { Text($0).font(.system(.caption2, design: .monospaced)) } } }
                Spacer()
            }.padding().frame(width: 300)
            WebViewHost(driver: worker.driver)
        }.frame(minWidth: 1100, minHeight: 700)
    }
}

struct WebViewHost: NSViewRepresentable {
    let driver: BrowserDriver
    func makeNSView(context: Context) -> NSView { driver.webView }
    func updateNSView(_ nsView: NSView, context: Context) {}
}
