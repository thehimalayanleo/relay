import XCTest
@testable import RelayDock

final class CapsuleTests: XCTestCase {
    func testClipboardCapsulePreservesSourceAndDestination() throws {
        let capsule = RelayCapsule.fromClipboard(
            "Parser work is partial. Keep the public API stable.",
            sourceApp: "Codex",
            destination: .claude
        )
        XCTAssertEqual(capsule.source.harness, "Codex")
        XCTAssertEqual(capsule.intendedRecipient, "Claude")
        XCTAssertTrue(capsule.traceSummary.contains("public API"))
        XCTAssertEqual(capsule.digest.count, 64)
    }

    func testClaudeRendererAddsVerificationBoundary() throws {
        let capsule = RelayCapsule.fromClipboard(
            "Three targeted tests passed. Full suite not run.",
            sourceApp: "Cursor",
            destination: .claude
        )
        let rendered = CapsuleRenderer.render(capsule, for: .claude)
        XCTAssertTrue(rendered.contains("borrowed context in Claude"))
        XCTAssertTrue(rendered.contains("Do not silently repair contradictions"))
        XCTAssertTrue(rendered.contains("Full suite not run"))
        XCTAssertTrue(rendered.contains("sha256:"))
    }

    func testPortableCapsuleRoundTrips() throws {
        let capsule = RelayCapsule.fromClipboard(
            "Portable context",
            sourceApp: "Notes",
            destination: .cursor
        )
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        let data = try encoder.encode(capsule)
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        let decoded = try decoder.decode(RelayCapsule.self, from: data)
        XCTAssertEqual(decoded.title, capsule.title)
        XCTAssertEqual(decoded.traceSummary, capsule.traceSummary)
        XCTAssertEqual(decoded.source, capsule.source)
        XCTAssertEqual(decoded.intendedRecipient, capsule.intendedRecipient)
        XCTAssertEqual(decoded.camp, capsule.camp)
        XCTAssertLessThan(abs(decoded.createdAt.timeIntervalSince(capsule.createdAt)), 1)
    }

    func testCapsuleCarriesCAMPEnvelope() throws {
        let capsule = RelayCapsule.fromClipboard(
            "Resume parser validation",
            sourceApp: "Codex",
            destination: .cursor
        )
        XCTAssertEqual(capsule.camp?.protocolVersion, "camp/0.1")
        XCTAssertEqual(capsule.camp?.trust, "unverified")
        XCTAssertEqual(capsule.camp?.learningDisposition, "candidate")
    }
}
