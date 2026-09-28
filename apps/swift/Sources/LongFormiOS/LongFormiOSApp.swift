import SwiftUI
import LongFormKit

/// iOS app: mirrors the React UI natively — create projects, approve the Story Bible, watch progress,
/// play and share the final video. Browser Mode runs on the Mac; iOS only orchestrates.
@main
struct LongFormiOSApp: App {
    @StateObject private var app = AppState()
    var body: some Scene {
        WindowGroup {
            if app.signedIn { RootTabs().environmentObject(app) } else { SignInView().environmentObject(app) }
        }
    }
}

struct RootTabs: View {
    @EnvironmentObject var app: AppState
    @State private var path = NavigationPath()
    var body: some View {
        TabView {
            NavigationStack(path: $path) {
                NewProjectView { p in path.append(p) }
                    .navigationTitle("New film")
                    .navigationDestination(for: Project.self) { p in StoryBibleView(project: p) { p in path.append(p.id) } }
                    .navigationDestination(for: String.self) { id in ShotProgressView(projectId: id) }
            }.tabItem { Label("New", systemImage: "plus.circle") }

            NavigationStack {
                List(app.projects) { p in
                    NavigationLink(value: p) { HStack { VStack(alignment: .leading) { Text(p.title).lineLimit(1); Text(p.prompt).font(.caption).foregroundStyle(.secondary).lineLimit(2) }; Spacer(); StatusBadge(p.status.rawValue) } }
                }
                .navigationTitle("Projects").refreshable { await app.refreshProjects() }.task { await app.refreshProjects() }
                .navigationDestination(for: Project.self) { p in
                    switch p.status {
                    case .complete: ResultView(projectId: p.id)
                    case .draft, .planning, .bible_ready: StoryBibleView(project: p) { _ in }
                    default: ShotProgressView(projectId: p.id)
                    }
                }
            }.tabItem { Label("Projects", systemImage: "film.stack") }

            NavigationStack { ProviderSettingsView() }.tabItem { Label("Settings", systemImage: "gear") }
        }
    }
}
