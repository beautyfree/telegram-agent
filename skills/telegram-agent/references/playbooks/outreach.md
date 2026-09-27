# Careful direct-message outreach

Choose the account using the main skill’s account-selection rules. Replace `NAME` below with that profile and keep the same account throughout this workflow. Include it in any action approval.

Use this only for consensual, relevant outreach. The default is to prepare drafts, not send them.

## Plan before sending

Provide a small reviewable list:

| Recipient | Relevant context | Draft | Status |
| --- | --- | --- |
| `@person` | Why this message is relevant | 1–3 sentence draft | Awaiting approval |

Do not make a list from private chat history unless the user clearly names the source chats and purpose.

## Per-recipient flow

```bash
telegram-agent --account NAME info @person
telegram-agent --account NAME msg list @person --limit 20
```

Use the context only to avoid duplication and personalise the draft. Show the final text and recipient to the user. Send only after approval:

```bash
telegram-agent --account NAME action send @person "A reviewed, personal message"
```

The returned message is in `.data`; record its ID only if the user asks for tracking.

## Limits and stop conditions

- Send in small batches; use a deliberate pause between different recipients.
- Do not reuse identical copy across recipients.
- Stop when Telegram rate-limits the account, a recipient objects, or the user’s intent becomes unclear.
- Do not send to bots, channels, or people who asked not to receive DMs.
