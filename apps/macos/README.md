# PassOn for macOS

PassOn is a small floating context port for borrowing copied context between Codex, Claude, Cursor, and other applications without opening a handoff form.

## Use it

1. Copy useful context in the source application.
2. Select the floating PassOn button.
3. Choose Codex, Claude, or Cursor.
4. Select **Borrow into**. PassOn creates a bounded resume prompt, copies it, and opens the destination application when installed.
5. Paste with Command-V.

Select **Copy link** to seal the same capsule in PassOn Core, attach a work pod, and copy one capability link for another person or agent.

The app does not read other applications through Accessibility APIs. Clipboard capture is explicit, understandable, and does not require broad system permissions.

If the local PassOn Core is running at `http://127.0.0.1:4317`, the transfer is also sealed in the service. The macOS app remains useful without the service.

Each transfer appears as a small visual space between the source and destination. It shows lineage, state, and the capsule digest instead of hiding the handoff behind a paste action.

## CAMP and Engram

This prototype uses **CAMP** as a small Context Adapter and Memory Protocol envelope. CAMP gives every transfer a stable space ID, event ID, parent link, trust state, retention policy, and learning disposition. The `.passon` file is the portable transport for that envelope.

The separation matters:

- PassOn moves and verifies working state now. This is the cross-context, H2 problem.
- CAMP records the lineage and whether the recipient accepted the context.
- An Engram-style continual-learning system can later ingest only accepted, verified spaces as learning candidates.

This does not claim that copying context updates model weights. It creates a clean feedback boundary where a future Engram API or internal training job can consume approved transfer receipts without training on every clipboard capture.

## Send context to another laptop

The preferred route is **Copy link**. It creates a short-lived capability link through PassOn Core and attaches the local work-pod demo. The receiving user opens the link in a browser and can pull the sealed context.

For an offline transfer, select **Export capsule**. PassOn writes a portable `.passon` JSON capsule and opens the standard macOS share picker. The receiving user can:

- Open it with PassOn for macOS.
- Inspect it as JSON without installing PassOn.
- Import it through the **Open** button.

The build is ad-hoc signed but not Apple-notarized, so a recipient may need to right-click the app and choose **Open** the first time.

## Build

Requires macOS 14 or newer and the Swift toolchain.

```bash
swift test
./scripts/build_app.sh
```

Artifacts:

- `dist/PassOn.app`
- `dist/PassOn-macOS.zip`

From the repository root, `npm run package` builds both the npm-installable CLI tarball and the macOS zip, then writes SHA-256 checksums under the root `dist/` directory. The app is ad-hoc signed for direct testing. Apple Developer ID signing and notarization are still required for warning-free public distribution.

## Adapter boundary

This native example uses the clipboard as the universal permissionless adapter. A deeper harness integration should implement the same operations through MCP, a plugin API, or a native SDK:

```text
capture current task
render for destination
seal in PassOn Core
return an acceptance receipt
```

The floating button should remain a thin controller. Canonical state and policy belong in PassOn Core.
