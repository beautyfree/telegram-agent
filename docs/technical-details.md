# Technical details

This page is for maintainers and users who need setup, compatibility, or implementation details. Start with the [main README](../README.md) if you only want to use Telegram from an AI agent.

## Compatibility

Install through the interactive picker:

```bash
npx skills add beautyfree/telegram-agent -g
```

`npx skills` selects supported installed agents. It supports Claude Code, Codex CLI, Cursor, Gemini CLI, Cline, Windsurf, OpenCode, Continue, Roo, Goose, and more. Use its flags only when you need a scripted or non-interactive install:

```bash
npx skills add beautyfree/telegram-agent -a codex -g
npx skills add beautyfree/telegram-agent -a claude-code -a cursor -g
```

## Architecture

`telegram-agent` connects through TDLib/MTProto as a Telegram user, rather than through Bot API. The installed skill gives an agent task guidance; the local CLI performs the Telegram operation and returns structured JSON. A local background daemon starts when needed and exits after ten minutes idle. Session data lives under `~/.telegram-agent/`; treat it like a password.

## Credentials and advanced setup

Most users should follow interactive sign-in. For custom deployments, environment configuration, multiple accounts, session portability, or troubleshooting, see [installation reference](../skills/telegram/references/installation.md).

## Release status

The v2 npm distribution publishes platform-specific compiled binaries and the
`telegram-agent` wrapper package together from the release workflow. The source
contains the release tooling at [`apps/cli/scripts/publish.ts`](../apps/cli/scripts/publish.ts).

## Project history and attribution

v2 is a GPL-3.0 fork of [avemeva/kurier](https://github.com/avemeva/kurier). It adds Saved-Messages reaction tags, portable session export/import, and universal AI-agent skill distribution. The legally required upstream notice and a precise change record are in [ATTRIBUTION.md](../ATTRIBUTION.md).

v1.x, through `v1.0.12`, used gram.js under MIT. Source remains on branch/tag `legacy-gramjs`.
