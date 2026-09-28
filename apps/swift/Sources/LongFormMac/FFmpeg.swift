import Foundation
import LongFormKit

/// Thin wrapper over an ffmpeg binary (bundled in the app or found on PATH). Used on-device for
/// last-frame extraction and for local assembly, mirroring packages/server/src/pipeline/assembler.ts.
public struct FFmpeg: Sendable {
    public let binary: URL
    public let ffprobe: URL

    public init(binary: URL? = nil, ffprobe: URL? = nil) {
        self.binary = binary ?? Self.find("ffmpeg")
        self.ffprobe = ffprobe ?? Self.find("ffprobe")
    }
    static func find(_ name: String) -> URL {
        if let bundled = Bundle.main.url(forResource: name, withExtension: nil) { return bundled }
        for p in ["/opt/homebrew/bin", "/usr/local/bin", "/usr/bin"] where FileManager.default.isExecutableFile(atPath: "\(p)/\(name)") { return URL(fileURLWithPath: "\(p)/\(name)") }
        return URL(fileURLWithPath: "/usr/local/bin/\(name)")
    }

    @discardableResult
    public func run(_ args: [String], tool: URL? = nil) async throws -> String {
        let p = Process(); p.executableURL = tool ?? binary; p.arguments = (tool == nil ? ["-hide_banner", "-loglevel", "error", "-y"] : []) + args
        let out = Pipe(), err = Pipe(); p.standardOutput = out; p.standardError = err
        try p.run()
        p.waitUntilExit()
        let o = String(data: out.fileHandleForReading.readDataToEndOfFile(), encoding: .utf8) ?? ""
        if p.terminationStatus != 0 { throw ClipGeneratorError.failed("ffmpeg: \(String(data: err.fileHandleForReading.readDataToEndOfFile(), encoding: .utf8) ?? "")") }
        return o
    }

    public func duration(of file: URL) async throws -> Double {
        let s = try await run(["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file.path], tool: ffprobe)
        return Double(s.trimmingCharacters(in: .whitespacesAndNewlines)) ?? 0
    }

    public func extractLastFrame(of video: URL) async throws -> URL {
        let out = video.deletingPathExtension().appendingPathExtension("last.png")
        let d = try await duration(of: video)
        try await run(["-ss", String(format: "%.2f", max(0, d - 0.1)), "-i", video.path, "-frames:v", "1", "-update", "1", out.path])
        return out
    }

    /// Local assembly (same rules as the server: normalise → concat/xfade → optional music).
    public func assemble(clips: [(file: URL, crossfadeIn: Bool)], size: (Int, Int), music: URL?, output: URL) async throws {
        var norm: [URL] = []
        for (i, c) in clips.enumerated() {
            let n = output.deletingLastPathComponent().appending(path: "norm_\(i).mp4")
            try await run(["-i", c.file.path, "-vf", "scale=\(size.0):\(size.1):force_original_aspect_ratio=decrease,pad=\(size.0):\(size.1):(ow-iw)/2:(oh-ih)/2,fps=24,format=yuv420p", "-an", "-c:v", "libx264", "-crf", "18", n.path])
            norm.append(n)
        }
        let silent = output.deletingLastPathComponent().appending(path: "video.mp4")
        if !clips.dropFirst().contains(where: { $0.crossfadeIn }) {
            let list = output.deletingLastPathComponent().appending(path: "list.txt")
            try norm.map { "file '\($0.path)'" }.joined(separator: "\n").write(to: list, atomically: true, encoding: .utf8)
            try await run(["-f", "concat", "-safe", "0", "-i", list.path, "-c", "copy", silent.path])
        } else {
            var durs: [Double] = []; for n in norm { durs.append(try await duration(of: n)) }
            var filter = "", prev = "[0:v]", offset = durs[0]
            for i in 1..<norm.count {
                let d = clips[i].crossfadeIn ? 0.75 : 0.02
                let label = i == norm.count - 1 ? "[v]" : "[v\(i)]"
                filter += "\(prev)[\(i):v]xfade=transition=fade:duration=\(d):offset=\(String(format: "%.3f", offset - d))\(label);"
                offset += durs[i] - d; prev = label
            }
            try await run(norm.flatMap { ["-i", $0.path] } + ["-filter_complex", String(filter.dropLast()), "-map", "[v]", "-c:v", "libx264", "-crf", "18", silent.path])
        }
        if let music {
            let total = try await duration(of: silent)
            try await run(["-i", silent.path, "-stream_loop", "-1", "-i", music.path, "-filter_complex", "[1:a]atrim=0:\(total),afade=t=out:st=\(max(0, total - 3)):d=3,volume=0.8[a]", "-map", "0:v", "-map", "[a]", "-c:v", "copy", "-c:a", "aac", "-shortest", output.path])
        } else {
            try await run(["-i", silent.path, "-f", "lavfi", "-i", "anullsrc=r=48000:cl=stereo", "-shortest", "-c:v", "copy", "-c:a", "aac", output.path])
        }
    }
}
