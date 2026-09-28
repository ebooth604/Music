import Foundation

// Mirrors openapi/longform.yaml. Keep field names identical to the TypeScript types in packages/shared.

public enum ProviderId: String, Codable, CaseIterable, Identifiable, Sendable {
    case runway, kling, luma, sora, veo
    public var id: String { rawValue }
    public var displayName: String {
        switch self { case .runway: "Runway"; case .kling: "Kling"; case .luma: "Luma"; case .sora: "Sora"; case .veo: "Veo" }
    }
}
public enum GenerationMode: String, Codable, CaseIterable, Sendable { case api, browser }
public enum AspectRatio: String, Codable, CaseIterable, Sendable { case r16x9 = "16:9", r9x16 = "9:16", r1x1 = "1:1", r4x3 = "4:3", r21x9 = "21:9" }
public enum Transition: String, Codable, Sendable { case cut, crossfade }
public enum ProjectStatus: String, Codable, Sendable { case draft, planning, bible_ready, prompting, generating, assembling, complete, failed, paused }
public enum ShotStatus: String, Codable, Sendable { case planned, queued, generating, checking, retrying, passed, failed, paused }

public struct ProjectSettings: Codable, Sendable, Equatable {
    public var targetMinutes: Double = 15
    public var clipLength: Int = 15
    public var aspectRatio: AspectRatio = .r16x9
    public var providerId: ProviderId = .runway
    public var mode: GenerationMode = .api
    public var musicUrl: String? = nil
    public var maxRetries: Int = 2
    public init() {}
    public var shotCount: Int { max(1, Int((targetMinutes * 60 / Double(clipLength)).rounded(.up))) }
}

public struct Character: Codable, Identifiable, Sendable, Equatable {
    public var id: String, name: String, role: String, age: String, face: String, hair: String, wardrobe: String, distinguishingMarks: String, lockedDescription: String
}
public struct Location: Codable, Identifiable, Sendable, Equatable { public var id: String, name: String, lockedDescription: String }
public struct MasterPrompt: Codable, Sendable, Equatable {
    public var logline, genre, visualStyle, colourPalette, lighting, cameraStyle, pacing, tone, styleBlock: String
    public var negativePrompt: String?
}
public struct Beat: Codable, Identifiable, Sendable, Equatable {
    public var index: Int, scene: String, action: String, characterIds: [String], locationId: String, emotionalTone: String, shotType: String
    public var transitionIn: Transition? = .cut
    public var cameraMovement: String? = "static"
    public var id: Int { index }
}
public struct StoryBible: Codable, Sendable, Equatable {
    public var master: MasterPrompt
    public var characters: [Character]
    public var locations: [Location]
    public var beats: [Beat]
}
public struct ContinuityNote: Codable, Sendable, Equatable { public var pose, position, lighting, cameraFraming, summary: String }
public struct QualityReport: Codable, Sendable, Equatable {
    public var pass: Bool, score: Double, characterConsistency: Double, styleConsistency: Double, continuity: Double, issues: [String]
}
public struct Shot: Codable, Identifiable, Sendable, Equatable {
    public var id: String, projectId: String, index: Int, beat: Beat
    public var prompt: String?
    public var continuityNote: ContinuityNote?
    public var status: ShotStatus
    public var attempt: Int
    public var clipUrl: String?, lastFrameUrl: String?, firstFrameUrl: String?
    public var quality: QualityReport?
    public var providerId: ProviderId, mode: GenerationMode
    public var costUsd: Double
    public var error: String?
    public var updatedAt: String
}
public struct Project: Codable, Identifiable, Sendable, Equatable {
    public var id: String, userId: String, title: String, prompt: String
    public var settings: ProjectSettings
    public var status: ProjectStatus
    public var bible: StoryBible?
    public var finalUrl: String?, error: String?
    public var createdAt: String, updatedAt: String
}
public struct ProgressSummary: Codable, Sendable { public var total, passed, generating, failed: Int; public var etaSeconds: Double?; public var costUsd: Double }
public struct ProviderSetting: Codable, Identifiable, Sendable {
    public var providerId: ProviderId, mode: GenerationMode, hasApiKey: Bool, browserWorkerOnline: Bool
    public var id: String { providerId.rawValue }
}
public struct Session: Codable, Sendable { public var token: String; public var userId: String }

// Browser worker protocol
public struct BrowserJob: Codable, Identifiable, Sendable {
    public var id: String, shotId: String, projectId: String, providerId: ProviderId, prompt: String
    public var startFrameUrl: String?
    public var duration: Int
    public var aspectRatio: AspectRatio
    public var attempt: Int
}
public struct BrowserJobResult: Codable, Sendable {
    public var clipUrl: String
    public var lastFrameUrl: String?
    public var meta: [String: String]
    public init(clipUrl: String, lastFrameUrl: String?, meta: [String: String] = [:]) { self.clipUrl = clipUrl; self.lastFrameUrl = lastFrameUrl; self.meta = meta }
}

extension Project: Hashable { public func hash(into hasher: inout Hasher) { hasher.combine(id); hasher.combine(updatedAt) } }
