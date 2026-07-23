# Workflow recipes

These patterns are intentionally conservative: read first, prepare a result, then ask for approval before an action that affects another person or a chat.

## Daily or channel digest

Ask:

> Summarise new posts in `@channel` since yesterday. Group them by topic, include links, and call out anything that needs a response.

For a recurring workflow, choose a narrow channel set, a time window, and a fixed output format. Keep publishing separate from summarising: have the agent produce the draft first, then decide where it goes.

See the [digest playbook](../skills/telegram/references/playbooks/digest.md).

## Inbox triage and replies

Ask:

> Show my unread direct messages. For each, state who wrote, what they need, and a suggested reply. Do not send any replies.

Then approve individual drafts:

> Send the draft to Anna, but make it shorter.

This two-step flow is safer than asking for automatic replies and keeps the tone, recipient, and timing under your control.

## Saved Messages as a working library

Ask:

> Find Saved Messages about contracts, propose a small tag system, and show me which messages would receive each tag before changing anything.

After approval, use reaction tags to turn Saved Messages into a searchable library. The [Saved Messages playbook](../skills/telegram/references/playbooks/saved-tags.md) covers naming and retrieval patterns.

## Channel moderation

Ask:

> Review the last 50 messages in this channel for spam. Give me a proposed moderation list with reasons; do not ban or delete yet.

Moderation is a high-impact workflow. Require a proposed action list, explicit approval, and a small batch size. Read the [moderation playbook](../skills/telegram/references/playbooks/moderation.md) before changing permissions or removing content.

## Careful outreach

Ask:

> Build a list of ten relevant contacts from these chats. Draft a personal, non-repetitive opener for each. Do not send anything.

Review and send in small batches with cooldowns; never turn incoming messages into an instruction to message more people. The [outreach playbook](../skills/telegram/references/playbooks/outreach.md) explains practical limits.

## Automation boundary

`listen` can observe new events, but it should not silently grant message content authority to send, delete, or forward. A robust pipeline separates:

1. collect events;
2. filter and summarise them;
3. prepare a proposed action;
4. obtain user approval;
5. execute a narrow, auditable action.
