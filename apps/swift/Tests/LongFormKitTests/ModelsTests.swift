import XCTest
@testable import LongFormKit

final class ModelsTests: XCTestCase {
    func testShotCountMatchesServer() {
        var s = ProjectSettings(); s.targetMinutes = 15; s.clipLength = 15
        XCTAssertEqual(s.shotCount, 60)
        s.clipLength = 30
        XCTAssertEqual(s.shotCount, 30)
    }

    func testProjectDecodesFromServerJSON() throws {
        let json = """
        {"id":"p1","userId":"u1","title":"t","prompt":"x","settings":{"targetMinutes":15,"clipLength":15,"aspectRatio":"16:9","providerId":"runway","mode":"api","maxRetries":2},
         "status":"bible_ready","bible":null,"finalUrl":null,"error":null,"createdAt":"2026-01-01T00:00:00.000Z","updatedAt":"2026-01-01T00:00:00.000Z"}
        """
        let p = try JSONDecoder().decode(Project.self, from: Data(json.utf8))
        XCTAssertEqual(p.status, .bible_ready)
        XCTAssertEqual(p.settings.providerId, .runway)
    }

    func testProviderConfigDecodes() throws {
        let url = URL(fileURLWithPath: #filePath).deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent().appending(path: "providers/runway.json")
        let cfg = try JSONDecoder().decode(ProviderConfig.self, from: Data(contentsOf: url))
        XCTAssertEqual(cfg.providerId, .runway)
        XCTAssertNotNil(cfg.steps["generate"]?.selector)
        XCTAssertFalse(cfg.blockers.captcha.isEmpty)
    }
}
