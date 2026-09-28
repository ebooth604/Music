import SwiftUI
import AuthenticationServices

// Views shared by the macOS and iOS apps (both mirror the React UI: Home, Story Bible, Progress, Result, Settings).

public struct StatusBadge: View {
    let text: String
    public init(_ text: String) { self.text = text }
    var color: Color {
        switch text { case "passed", "complete": .green; case "failed", "paused": .red; case "generating", "checking", "retrying", "assembling", "planning": .purple; default: .gray }
    }
    public var body: some View {
        Text(text.replacingOccurrences(of: "_", with: " ").uppercased()).font(.caption2.bold()).padding(.horizontal, 8).padding(.vertical, 3)
            .background(color.opacity(0.2)).foregroundStyle(color).clipShape(Capsule())
    }
}

public struct SignInView: View {
    @EnvironmentObject var app: AppState
    @State private var email = "", token = "", sent = false
    public init() {}
    public var body: some View {
        VStack(spacing: 16) {
            Text("LongForm").font(.largeTitle.bold())
            Text("One prompt. One continuous film.").foregroundStyle(.secondary)
            SignInWithAppleButton(.signIn) { req in req.requestedScopes = [.email] } onCompletion: { result in
                if case .success(let auth) = result, let cred = auth.credential as? ASAuthorizationAppleIDCredential,
                   let data = cred.identityToken, let tok = String(data: data, encoding: .utf8) {
                    Task { await app.signInWithApple(identityToken: tok) }
                }
            }.frame(height: 44)
            Divider()
            TextField("Email", text: $email).textFieldStyle(.roundedBorder)
            Button("Send magic link") { Task { try? await app.api.requestMagicLink(email: email); sent = true } }.disabled(email.isEmpty)
            if sent {
                TextField("Paste token from email", text: $token).textFieldStyle(.roundedBorder)
                Button("Verify") { Task { await app.verifyMagicLink(token) } }.buttonStyle(.borderedProminent)
            }
            TextField("Backend URL", text: Binding(get: { app.baseURL.absoluteString }, set: { if let u = URL(string: $0) { app.baseURL = u } })).textFieldStyle(.roundedBorder).font(.caption)
            if let e = app.lastError { Text(e).foregroundStyle(.red).font(.caption) }
        }.padding(32).frame(maxWidth: 420)
    }
}

public struct NewProjectView: View {
    @EnvironmentObject var app: AppState
    @State private var prompt = ""
    @State private var settings = ProjectSettings()
    @State private var busy = false
    var onCreated: (Project) -> Void
    public init(onCreated: @escaping (Project) -> Void) { self.onCreated = onCreated }
    public var body: some View {
        Form {
            Section("Prompt") {
                TextEditor(text: $prompt).frame(minHeight: 100)
                Text("e.g. “a lone astronaut explores an abandoned Mars colony, moody sci-fi”").font(.caption).foregroundStyle(.secondary)
            }
            Section("Settings") {
                Stepper("Target length: \(Int(settings.targetMinutes)) min", value: $settings.targetMinutes, in: 1...60)
                Picker("Clip length", selection: $settings.clipLength) { Text("15 s").tag(15); Text("30 s").tag(30) }
                Picker("Aspect ratio", selection: $settings.aspectRatio) { ForEach(AspectRatio.allCases, id: \.self) { Text($0.rawValue).tag($0) } }
                Picker("Provider", selection: $settings.providerId) { ForEach(ProviderId.allCases) { Text($0.displayName).tag($0) } }
                Picker("Mode", selection: $settings.mode) { Text("API").tag(GenerationMode.api); Text("Browser (Mac worker)").tag(GenerationMode.browser) }
                Text("\(settings.shotCount) shots of \(settings.clipLength)s").foregroundStyle(.secondary)
            }
            Button(busy ? "Planning…" : "Generate Story Bible") {
                busy = true
                Task { defer { busy = false }; if let p = try? await app.api.createProject(prompt: prompt, settings: settings) { onCreated(p) } }
            }.disabled(busy || prompt.count < 3).buttonStyle(.borderedProminent)
        }
    }
}

public struct StoryBibleView: View {
    @EnvironmentObject var app: AppState
    @State var project: Project
    @State private var bible: StoryBible?
    var onApproved: (Project) -> Void
    public init(project: Project, onApproved: @escaping (Project) -> Void) { _project = State(initialValue: project); self.onApproved = onApproved }
    public var body: some View {
        Group {
            if let b = Binding($bible) {
                Form {
                    Section("Style block (repeated verbatim in every clip prompt)") { TextEditor(text: b.master.styleBlock).frame(minHeight: 120) }
                    Section("Characters") {
                        ForEach(b.characters) { c in
                            VStack(alignment: .leading) { TextField("Name", text: c.name).font(.headline); TextEditor(text: c.lockedDescription).frame(minHeight: 70) }
                        }
                    }
                    Section("Locations") { ForEach(b.locations) { l in VStack(alignment: .leading) { Text(l.wrappedValue.name).font(.headline); TextEditor(text: l.lockedDescription).frame(minHeight: 60) } } }
                    Section("Beat sheet (\(b.wrappedValue.beats.count) shots)") {
                        ForEach(b.beats) { beat in
                            VStack(alignment: .leading, spacing: 4) {
                                HStack { Text("#\(beat.wrappedValue.index + 1)").bold(); TextField("Scene", text: beat.scene); Text(beat.wrappedValue.shotType).font(.caption).foregroundStyle(.secondary) }
                                TextEditor(text: beat.action).frame(minHeight: 50)
                                TextField("Tone", text: beat.emotionalTone).font(.caption)
                            }
                        }
                    }
                    HStack {
                        Button("Regenerate bible") { Task { try? await app.api.replan(project.id); bible = nil; await poll() } }
                        Spacer()
                        Button("Approve & generate") {
                            Task { if let bb = bible { _ = try? await app.api.saveBible(project.id, bb) }; if let p = try? await app.api.approve(project.id) { onApproved(p) } }
                        }.buttonStyle(.borderedProminent)
                    }
                }
            } else if project.status == .failed {
                VStack { Text("Planning failed").font(.title2); Text(project.error ?? "").foregroundStyle(.red); Button("Retry") { Task { try? await app.api.replan(project.id); await poll() } } }
            } else {
                VStack(spacing: 12) { ProgressView(); Text("Writing the Story Bible…").font(.title3); Text("Prompt Architect → Story Planner").foregroundStyle(.secondary) }.task { await poll() }
            }
        }.navigationTitle("Story Bible")
    }
    private func poll() async {
        while bible == nil {
            if let p = try? await app.api.getProject(project.id) { project = p; if let b = p.bible { bible = b; return }; if p.status == .failed { return } }
            try? await Task.sleep(for: .seconds(3))
        }
    }
}

public struct ShotProgressView: View {
    @EnvironmentObject var app: AppState
    let projectId: String
    @State private var project: Project?
    @State private var shots: [Shot] = []
    @State private var progress: ProgressSummary?
    @State private var selected: Shot?
    public init(projectId: String) { self.projectId = projectId }
    public var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                if let p = project, let pr = progress {
                    HStack { Text(p.title).font(.title2.bold()); StatusBadge(p.status.rawValue) }
                    if let e = p.error { Text(e).foregroundStyle(.red) }
                    HStack(spacing: 20) {
                        stat("\(pr.passed)/\(pr.total)", "passed"); stat("\(pr.generating)", "in flight"); stat("\(pr.failed)", "attention")
                        stat(pr.etaSeconds.map { "\(Int($0 / 60)) min" } ?? "—", "ETA"); stat(String(format: "$%.2f", pr.costUsd), "est. cost")
                    }
                    ProgressView(value: Double(pr.passed), total: Double(max(pr.total, 1)))
                    HStack {
                        if p.status == .generating { Button("Pause") { Task { _ = try? await app.api.pause(projectId); await refresh() } } }
                        if p.status == .paused || p.status == .failed { Button("Resume") { Task { _ = try? await app.api.resume(projectId); await refresh() } }.buttonStyle(.borderedProminent) }
                        Picker("Mode", selection: Binding(get: { p.settings.mode }, set: { m in var s = p.settings; s.mode = m; Task { _ = try? await app.api.saveSettings(projectId, s); await refresh() } })) {
                            Text("API").tag(GenerationMode.api); Text("Browser").tag(GenerationMode.browser)
                        }.pickerStyle(.segmented).frame(width: 200)
                    }
                }
                LazyVGrid(columns: [GridItem(.adaptive(minimum: 150))], spacing: 10) {
                    ForEach(shots) { s in ShotCell(shot: s).onTapGesture { selected = s } }
                }
            }.padding()
        }
        .task { await refresh(); while !Task.isCancelled { try? await Task.sleep(for: .seconds(4)); await refresh() } }
        .sheet(item: $selected) { s in ShotDetail(projectId: projectId, shot: s) { Task { await refresh() } } }
        .navigationTitle("Progress")
    }
    func stat(_ v: String, _ l: String) -> some View { VStack(alignment: .leading) { Text(v).font(.title3.bold()); Text(l).font(.caption).foregroundStyle(.secondary) } }
    func refresh() async {
        async let p = app.api.getProject(projectId); async let s = app.api.shots(projectId); async let pr = app.api.progress(projectId)
        if let (p, s, pr) = try? await (p, s, pr) { project = p; shots = s; progress = pr }
    }
}

public struct ShotCell: View {
    let shot: Shot
    public init(shot: Shot) { self.shot = shot }
    public var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            ZStack { Rectangle().fill(.black).aspectRatio(16/9, contentMode: .fit)
                if let f = shot.firstFrameUrl, let u = URL(string: f) { AsyncImage(url: u) { $0.resizable().scaledToFill() } placeholder: { ProgressView() }.aspectRatio(16/9, contentMode: .fit).clipped() }
                else { Text(shot.beat.shotType).font(.caption).foregroundStyle(.secondary) } }
            HStack { Text("#\(shot.index + 1)").font(.caption); Spacer(); StatusBadge(shot.status.rawValue) }
        }.padding(6).background(.quaternary.opacity(0.4)).clipShape(RoundedRectangle(cornerRadius: 8))
    }
}

public struct ShotDetail: View {
    @EnvironmentObject var app: AppState
    let projectId: String
    @State var shot: Shot
    @State private var prompt: String
    var onChanged: () -> Void
    @Environment(\.dismiss) var dismiss
    public init(projectId: String, shot: Shot, onChanged: @escaping () -> Void) { self.projectId = projectId; _shot = State(initialValue: shot); _prompt = State(initialValue: shot.prompt ?? ""); self.onChanged = onChanged }
    public var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack { Text("Shot \(shot.index + 1)").font(.title2.bold()); StatusBadge(shot.status.rawValue); Spacer(); Button("Close") { dismiss() } }
            if let c = shot.clipUrl, let u = URL(string: c) { VideoPlayerView(url: u).frame(height: 240) }
            Text("\(shot.beat.scene) — \(shot.beat.action)").foregroundStyle(.secondary)
            if let q = shot.quality { Text("Quality \(Int(q.score * 100))% · character \(Int(q.characterConsistency * 100))% · style \(Int(q.styleConsistency * 100))% · continuity \(Int(q.continuity * 100))%").font(.caption).foregroundStyle(q.pass ? .green : .red)
                if !q.issues.isEmpty { Text(q.issues.joined(separator: "; ")).font(.caption).foregroundStyle(.red) } }
            Text("Clip prompt (editable)").font(.caption).foregroundStyle(.secondary)
            TextEditor(text: $prompt).font(.system(.caption, design: .monospaced)).frame(minHeight: 160)
            HStack {
                Button("Save prompt") { Task { _ = try? await app.api.savePrompt(projectId, index: shot.index, prompt: prompt); onChanged() } }.disabled(prompt.isEmpty)
                Button("Regenerate shot \(shot.index + 1)") { Task { if !prompt.isEmpty { _ = try? await app.api.savePrompt(projectId, index: shot.index, prompt: prompt) }; _ = try? await app.api.regenerate(projectId, index: shot.index); onChanged(); dismiss() } }.buttonStyle(.borderedProminent)
                if shot.status == .failed && shot.clipUrl != nil { Button("Accept anyway") { Task { _ = try? await app.api.acceptShot(projectId, index: shot.index); onChanged(); dismiss() } } }
            }
        }.padding().frame(minWidth: 520, minHeight: 520)
    }
}

public struct ResultView: View {
    @EnvironmentObject var app: AppState
    let projectId: String
    @State private var project: Project?
    @State private var shots: [Shot] = []
    @State private var selected: Shot?
    public init(projectId: String) { self.projectId = projectId }
    public var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                if let p = project {
                    Text(p.title).font(.title2.bold())
                    if let f = p.finalUrl, let u = URL(string: f) {
                        VideoPlayerView(url: u).aspectRatio(16/9, contentMode: .fit)
                        HStack { ShareLink(item: u) { Label("Share / Download", systemImage: "square.and.arrow.up") }.buttonStyle(.borderedProminent) }
                    } else { Text("Not assembled yet.").foregroundStyle(.secondary) }
                    Text("Shots — tap one to view its prompt or regenerate it").font(.headline)
                    LazyVGrid(columns: [GridItem(.adaptive(minimum: 150))], spacing: 10) { ForEach(shots) { s in ShotCell(shot: s).onTapGesture { selected = s } } }
                }
            }.padding()
        }
        .task { await refresh() }
        .sheet(item: $selected) { s in ShotDetail(projectId: projectId, shot: s) { Task { await refresh() } } }
        .navigationTitle("Result")
    }
    func refresh() async { project = try? await app.api.getProject(projectId); shots = (try? await app.api.shots(projectId)) ?? [] }
}

public struct ProviderSettingsView: View {
    @EnvironmentObject var app: AppState
    @State private var rows: [ProviderSetting] = []
    @State private var keys: [ProviderId: String] = [:]
    @State private var results: [ProviderId: String] = [:]
    /// macOS injects a Browser-Mode tester; iOS leaves it nil.
    var browserTest: ((ProviderId) async -> String)?
    public init(browserTest: ((ProviderId) async -> String)? = nil) { self.browserTest = browserTest }
    public var body: some View {
        Form {
            ForEach(rows) { r in
                Section(r.providerId.displayName) {
                    Picker("Mode", selection: Binding(get: { r.mode }, set: { m in Task { try? await app.api.saveProvider(r.providerId, mode: m, apiKey: nil); await load() } })) {
                        Text("API mode (key)").tag(GenerationMode.api); Text("Browser mode (Mac worker \(r.browserWorkerOnline ? "online" : "offline"))").tag(GenerationMode.browser)
                    }
                    HStack {
                        SecureField(r.hasApiKey ? "•••••••• (stored; replace)" : (r.providerId == .kling ? "accessKey:secretKey" : "API key"), text: Binding(get: { keys[r.providerId] ?? "" }, set: { keys[r.providerId] = $0 }))
                        Button("Save") {
                            let k = keys[r.providerId] ?? ""
                            Task { try? Keychain.set(k, for: Keychain.apiKeyKey(r.providerId)); try? await app.api.saveProvider(r.providerId, mode: nil, apiKey: .some(k)); keys[r.providerId] = nil; await load() }
                        }.disabled((keys[r.providerId] ?? "").isEmpty)
                    }
                    HStack {
                        Button("Test connection") {
                            Task {
                                results[r.providerId] = "Testing…"
                                if r.mode == .browser, let bt = browserTest { results[r.providerId] = await bt(r.providerId) }
                                else { results[r.providerId] = (try? await app.api.testProvider(r.providerId))?.message ?? "failed" }
                            }
                        }
                        if let res = results[r.providerId] { Text(res).font(.caption).foregroundStyle(.secondary) }
                    }
                }
            }
        }.task { await load() }.navigationTitle("Settings")
    }
    func load() async { rows = (try? await app.api.providers()) ?? [] }
}
