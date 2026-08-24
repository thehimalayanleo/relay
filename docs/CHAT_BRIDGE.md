# Relay chat bridge

Relay sessions are not tied to the browser UI. Every inbound message is normalized into one small envelope:

```json
{
  "sender": { "name": "Sam", "role": "Partner" },
  "text": "I sleep on my side and care about motion isolation.",
  "source": {
    "platform": "imessage",
    "threadId": "conversation-42",
    "messageId": "message-7"
  }
}
```

Send it to `POST /v1/sessions/:id/messages` with the session capability in the `Authorization` header. Relay deduplicates provider retries by `platform` and `messageId`, broadcasts the message over the existing SSE stream, and exposes one chronological thread at `GET /v1/sessions/:id/messages`.

Relay stores the normalized fields above. It does not store a provider's raw webhook payload or credentials.

## Adapter boundary

```text
iMessage, Slack, Discord, or another chat adapter
                         ↓
              normalized Relay message
                         ↓
        one capability-scoped shared session
                         ↓
       checkpoint → serialized shared agent
                         ↓
             normalized agent response
```

An adapter is responsible for translating provider events to the Relay envelope and sending Relay responses back to the provider. The shared session, memory selection, checkpoint, and model queue stay on the Relay host.

## iMessage path

The current release provides the adapter-ready HTTP and CLI surface. It does not yet ship a native Messages extension.

Two implementation paths are viable:

1. A small macOS bridge process watches explicitly authorized Messages conversations and forwards normalized events to Relay.
2. A native iMessage app extension presents a Relay session picker inside Messages and sends the selected message through the same endpoint.

Both paths should keep the session capability in macOS Keychain, never in message text. Provider-specific code stays outside the Relay core, so the same session can also be reached from a browser, CLI, Slack, or another chat surface.

## CLI adapter smoke test

```bash
relay session message '<invite-link>' \
  --actor 'Sam' \
  --role 'Partner' \
  --platform imessage \
  --message-id message-7 \
  --text 'I sleep on my side and care about motion isolation.'

relay session messages '<invite-link>'
```
