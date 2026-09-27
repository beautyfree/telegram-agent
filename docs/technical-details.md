# Technical details

This page is for maintainers and users who need setup, compatibility, or implementation details. Start with the [main README](../README.md) if you only want to use Telegram from an AI agent.

## Compatibility

Install through the interactive picker:

```bash
npx skills add beautyfree/telegram-agent --skill telegram-agent -g
```

`npx skills` selects supported installed agents. It supports Claude Code, Codex CLI, Cursor, Gemini CLI, Cline, Windsurf, OpenCode, Continue, Roo, Goose, and more. Use its flags only when you need a scripted or non-interactive install:

```bash
npx skills add beautyfree/telegram-agent --skill telegram-agent -a codex -g
npx skills add beautyfree/telegram-agent --skill telegram-agent -a claude-code -a cursor -g
```

## Architecture

`telegram-agent` connects through TDLib/MTProto as a Telegram user, rather than through Bot API. The installed skill gives an agent task guidance; the local CLI performs the Telegram operation and returns readable terminal results or structured JSON for pipes and `--json`. A local background daemon starts when needed and exits after ten minutes idle. Session data lives under `~/.telegram-agent/`; treat it like a password.

### Account isolation

The entry point resolves `--account`, `TG_ACCOUNT`, and the saved selection before
loading modules that capture filesystem paths. Child processes inherit the resolved
account. The original root directory is the implicit `default`; named profiles use
`accounts/NAME/` beneath it. No session migration is performed. Each account's
services use private tokens and dynamically allocated loopback ports; port files
are written after binding. Changing the saved default never mutates a running
process's selection. Renaming/removal authenticates service health and verifies its
PID before stopping it and changing local files.

### Output rendering

Command handlers continue to produce the same structured response envelopes. A
shared presentation layer selects tables/details when stdout is a terminal and
compact JSON otherwise. `--json` and `--pretty` override detection before account
selection, so bootstrap errors use the requested format too. Streaming uses the
same selection while retaining the original NDJSON event schema in machine mode.
The readable renderer wraps by terminal display width, preserves grapheme clusters,
and neutralizes terminal control sequences from untrusted content. No new runtime
dependency is required.

## Credentials and advanced setup

Most users should follow interactive sign-in. For custom deployments, environment configuration, multiple accounts, session portability, or troubleshooting, see [installation reference](../skills/telegram-agent/references/installation.md).

## Release status

The v2 npm distribution publishes platform-specific compiled binaries and the
`telegram-agent` wrapper package together from the release workflow. The source
contains the release tooling at [`apps/cli/scripts/publish.ts`](../apps/cli/scripts/publish.ts).

## Project history

v2 uses TDLib and is distributed under [GPL-3.0](../LICENSE). It includes Saved-Messages reaction tags, portable session export/import, and universal AI-agent skill distribution. See the [changelog](../CHANGELOG.md) for release details.

v1.x, through `v1.0.12`, used gram.js under MIT. Source remains on branch/tag `legacy-gramjs`.
