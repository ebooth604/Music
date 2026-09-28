import SwiftUI
import AVKit

public struct VideoPlayerView: View {
    let url: URL
    @State private var player: AVPlayer?
    public init(url: URL) { self.url = url }
    public var body: some View {
        VideoPlayer(player: player).onAppear { player = AVPlayer(url: url) }.onDisappear { player?.pause() }
            .clipShape(RoundedRectangle(cornerRadius: 10))
    }
}
