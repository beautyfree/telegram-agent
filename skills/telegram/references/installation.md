# Install and authenticate telegram-agent

## Install the CLI

Node.js 20+ is required. Once v2 is available on npm, install the CLI with one of these commands:

```bash
npm install -g telegram-agent
# or: bun install -g telegram-agent
# or: pnpm add -g telegram-agent
```

Then verify the installed binary:

```bash
telegram-agent --version
telegram-agent doctor
```

If your global npm bin directory is not on `PATH`, use a Node version manager such as `nvm`, `fnm`, `asdf`, or `volta`, then reinstall. Do not use `sudo` unless it is the established policy for your machine.

## Install the agent skill

The skill is separate from the binary. Install it into an AI client with:

```bash
npx skills add beautyfree/telegram-agent -g
```

Use `-a <client>` for a scripted install, for example `-a codex`, `-a claude-code`, or `-a cursor`. The skill will look for `telegram-agent` on `PATH` when a Telegram task arrives.

## Authenticate a Telegram user account

This is an MTProto/TDLib client, not the Telegram Bot API. Obtain a free API ID and hash from [my.telegram.org/apps](https://my.telegram.org/apps), then supply them to the CLI:

```bash
export TG_API_ID=123456
export TG_API_HASH=abcdef0123456789abcdef0123456789
telegram-agent login
telegram-agent me
```

`login` performs the Telegram phone → code → 2FA flow. The CLI may persist the credentials and TDLib session under `~/.telegram-agent/`; that directory is sensitive and should be readable only by you.

For repeated shell use, persist the two exports in your shell configuration only if that is appropriate for your local security model. A safer option on shared machines is to provide the variables only for the login command/session.

## Verify and recover

```bash
telegram-agent doctor           # TDLib, credentials, and daemon health
telegram-agent me               # Verify that the logged-in account works
telegram-agent daemon status    # Inspect the local background daemon
telegram-agent daemon stop      # Stop a stuck daemon; it restarts automatically
telegram-agent logout           # Revoke the local Telegram session
```

If the session is revoked, run `telegram-agent login` again. If `doctor` reports missing credentials, make sure `TG_API_ID` and `TG_API_HASH` are available to the process that starts the CLI.

## Storage and controlled portability

The default state directory is `~/.telegram-agent/`. Override it with `TG_APP_DIR=/path/to/state` when isolating accounts, using a container, or running CI.

```bash
telegram-agent session export | jq -r '.data.blob' > session.b64
telegram-agent session import --string "$(cat session.b64)" --force
```

The exported blob is an account credential. Store it in a secrets manager; never commit it, include it in logs, or send it through Telegram.

## Troubleshooting

| Symptom | What to do |
| --- | --- |
| `command not found` | Ensure your global npm bin directory is on `PATH`, then reinstall. |
| Missing credentials | Set `TG_API_ID` and `TG_API_HASH`, then rerun `telegram-agent doctor`. |
| Login/session failure | Run `telegram-agent logout`, then `telegram-agent login` again. |
| Daemon is stuck | Run `telegram-agent daemon stop`; the next request starts it again. |
| `FLOOD_WAIT` | Back off for the reported duration; do not retry bulk operations aggressively. |
| Browser does not open during login | Use the local URL printed by the CLI, if one is shown. |
