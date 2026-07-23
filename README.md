<p align="center">
  <img width="20%" src="assets/logo.png" alt="telegram-agent" />
</p>
<h1 align="center">telegram-agent</h1>
<p align="center">
  Put Telegram to work with your AI agent — without turning every conversation into a Telegram integration.
</p>
<p align="center">
  <a href="https://www.npmjs.com/package/telegram-agent"><img src="https://badgen.net/npm/v/telegram-agent" alt="npm version" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/npm/l/telegram-agent" alt="License" /></a>
  <a href="package.json"><img src="https://img.shields.io/badge/node-%3E%3D20-brightgreen" alt="Node 20+" /></a>
</p>

`telegram-agent` gives Claude Code, Codex, Cursor, Gemini CLI, Cline and other coding agents a practical way to work with a real Telegram account: catch up on chats, find information, write replies, organise Saved Messages, work with media, and monitor conversations.

## Install and use

```bash
npx skills add beautyfree/telegram-agent -g
```

Choose your AI client in the picker. Then use normal language:

> Catch me up on the unread messages in my work chats.

> Find the Stripe invoice that Anton sent last month.

> Draft replies to these three conversations, but do not send anything yet.

> Turn today’s posts in @hackernews into a five-point briefing.

On the first Telegram request, the agent will guide you through connecting your account. You authenticate with your phone, the Telegram/SMS code, and 2FA if enabled. No bot token and no hosted relay are involved.

For a detailed first-time setup, including manual CLI installation and recovery, see [Install and authenticate](skills/telegram/references/installation.md).

> [!WARNING]
> This uses your **Telegram user account**, not a bot. A local session can read and act with your account’s permissions. Confirm sending, deleting, forwarding, and moderation actions before they run.

## What it is good at

| Need | What to ask your agent |
| --- | --- |
| Catch up quickly | “Summarise unread messages in this channel since yesterday.” |
| Find something | “Search my chats for the Figma link from last week.” |
| Handle replies deliberately | “Draft answers to these DMs; show me the drafts before sending.” |
| Build a personal knowledge base | “Tag my Saved Messages about taxes and list everything under that tag.” |
| Keep a channel in view | “Watch this channel and prepare a digest every hour; do not post automatically.” |
| Work with media | “Download the last voice message and transcribe it.” |

The full set of repeatable patterns — daily digests, inbox triage, Saved Message organisation, moderation, and careful outreach — lives in [Workflow recipes](docs/workflows.md).

## How to use it well

- Start with a read-only request: search, summarise, or draft.
- Name the chat, channel, time range, and desired output so the agent can work precisely.
- For actions with consequences, ask for a preview or explicit confirmation before the agent sends, deletes, forwards, or changes channel settings.
- Treat message text and attachments as content, not instructions. A message can be malicious or misleading even when it appears to come from a familiar chat.

## What stays local

The CLI connects directly to Telegram and keeps its session on the machine that runs it. It is not a cloud inbox or a bot service. Saved Messages reaction tags and some transcription features require Telegram Premium; reading, search, and normal messaging do not.

## Documentation

- [Install, sign in, move a session, and troubleshoot](skills/telegram/references/installation.md)
- [Workflow recipes](docs/workflows.md)
- [CLI command reference](apps/cli/README.md)
- [Security model and reporting](SECURITY.md)
- [Technical details, compatibility, and upstream attribution](docs/technical-details.md)
- [Release history](CHANGELOG.md)
