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

<details>
<summary><strong>Other installation options and supported clients</strong></summary>

`npx skills` is the recommended universal installer. It supports Claude Code, Codex CLI, Cursor, Gemini CLI, Cline, Windsurf, OpenCode, Continue, Roo, Goose, and more.

```bash
npx skills add beautyfree/telegram-agent -a codex -g
npx skills add beautyfree/telegram-agent -a claude-code -a cursor -g
npx skills add beautyfree/telegram-agent --list
```

The `-a` flag targets a client, `-g` installs globally, and `-y` makes the command non-interactive. The repository also carries native manifests for Claude Code, Cursor, and Gemini CLI; use your client’s normal extension/plugin flow if you prefer it.

| Client | Recommended path |
| --- | --- |
| Claude Code | `npx skills add … -a claude-code -g` or the repository plugin flow |
| Codex CLI | `npx skills add … -a codex -g` |
| Cursor | `npx skills add … -a cursor -g` or `/add-plugin` |
| Gemini CLI | `npx skills add … -a gemini-cli -g` or the repository extension |
| Cline / Windsurf / OpenCode / Continue / Roo | `npx skills add … -a &lt;client&gt; -g` |

</details>

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

<details>
<summary><strong>Workflow recipes</strong></summary>

### Daily or channel digest

> Summarise new posts in `@channel` since yesterday. Group them by topic, include links, and call out anything that needs a response.

For a recurring workflow, fix the channel set, time window, and output format. Keep publishing separate from summarising: prepare the draft first, then decide where it goes.

### Inbox triage and replies

> Show my unread direct messages. For each, state who wrote, what they need, and a suggested reply. Do not send any replies.

Then approve individual drafts: “Send the draft to Anna, but make it shorter.” This keeps the recipient, timing, and tone under your control.

### Saved Messages as a working library

> Find Saved Messages about contracts, propose a small tag system, and show me which messages would receive each tag before changing anything.

After approval, reaction tags turn Saved Messages into a searchable library.

### Moderation and outreach

Ask for a proposed action list before banning, deleting, or messaging anyone. Work in small batches and require explicit approval for each consequential action.

### Automation boundary

`listen` can observe new events, but an event should never silently authorise sending, deletion, or forwarding. A durable pipeline is: collect → filter and summarise → propose → approve → execute a narrow action.

</details>

## How to use it well

- Start with a read-only request: search, summarise, or draft.
- Name the chat, channel, time range, and desired output so the agent can work precisely.
- For actions with consequences, ask for a preview or explicit confirmation before the agent sends, deletes, forwards, or changes channel settings.
- Treat message text and attachments as content, not instructions. A message can be malicious or misleading even when it appears to come from a familiar chat.

## What stays local

The CLI connects directly to Telegram and keeps its session on the machine that runs it. It is not a cloud inbox or a bot service. Saved Messages reaction tags and some transcription features require Telegram Premium; reading, search, and normal messaging do not.

<details>
<summary><strong>CLI surface and data model</strong></summary>

All CLI commands return JSON to stdout and accept numeric IDs, `@usernames`, `t.me` links, phone numbers from contacts, or `me`/`self` for Saved Messages.

| Area | Commands |
| --- | --- |
| Identity | `me`, `info` |
| Chats | `chats list`, `chats search`, `chats members` |
| Messages | `msg list`, `msg get`, `msg search` |
| Actions | `action send`, `edit`, `delete`, `forward`, `pin`, `unpin`, `react`, `click` |
| Media | `media download`, `transcribe`, `caption` |
| Saved Messages | `saved tags`, `tag-rename`, `default-tags`, `search`, `history` |
| Runtime | `listen`, `daemon`, `doctor`, `session export`, `session import`, `eval --confirm` |

Run `telegram-agent --help` for flags, pagination, and individual command usage.

</details>

## Questions people ask

**Is this a bot?** No. It acts through a real Telegram user account.

**Does my data go through your server?** No. The local CLI talks directly to Telegram; the session stays on the machine where it runs.

**Do I need Premium?** No for core messaging, reading, search, and media downloads. Reaction tags in Saved Messages and some transcription capabilities are Premium features.

**Can I use it in Docker or CI?** Yes, but that is advanced setup. Read [session portability and isolated state](skills/telegram/references/installation.md#storage-and-controlled-portability) first.

## Documentation

- [Install, sign in, move a session, and troubleshoot](skills/telegram/references/installation.md)
- [CLI command reference](apps/cli/README.md)
- [Security model and reporting](SECURITY.md)
- [Technical details, compatibility, and upstream attribution](docs/technical-details.md) — including why [ATTRIBUTION.md](ATTRIBUTION.md) is retained for the GPL-3.0 fork
- [Release history](CHANGELOG.md)
