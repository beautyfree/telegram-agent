# telegram-agent

Telegram CLI for AI agents. Read messages, send messages, search, download media, manage chats — all from the terminal. Readable terminal output and JSON for automation.

## Setup

Install the skill first with the interactive picker:

```bash
npx skills add beautyfree/telegram-agent --skill telegram-agent -g
```

For CLI installation, sign-in, and troubleshooting, see [the installation guide](../../skills/telegram-agent/references/installation.md).

## Authentication

telegram-agent connects to your **real Telegram account** — it reads and sends actual messages, not a sandbox. Authenticate before first use:

```bash
telegram-agent login                     # Log in to Telegram (interactive)
telegram-agent me                        # Verify connection
```


## Multiple accounts

Your existing session is the reserved `default` account. It stays in its original
location; adding an account never moves or replaces it.

```bash
telegram-agent accounts add work               # Create profile and sign in interactively
telegram-agent accounts add personal --no-login # Create profile for later login/import
telegram-agent accounts login personal         # Phone, code and 2FA flow
telegram-agent accounts list                   # Profiles, identities and local service state
telegram-agent accounts current                # Effective selection and saved default
telegram-agent accounts use work               # Save default for subsequent commands
telegram-agent --account personal me            # Override for one command
telegram-agent accounts status work            # Inspect without starting the daemon
telegram-agent accounts rename work office     # Stop its services, then rename
telegram-agent accounts remove office --confirm # Delete only its local files
telegram-agent accounts remove personal --confirm --logout # Revoke session, then delete
```

`add` does not change the saved default. If login fails or is cancelled, the
profile remains available for `accounts login NAME`. Names are 1–32 lowercase
letters, digits, underscores or hyphens, starting with a letter; reserved system
names are rejected. `default` cannot be renamed, replaced, or removed because its
directory also contains the named profiles. Use `--account default logout` to
revoke its authorization.

Selection order is **`--account NAME` > `TG_ACCOUNT` > `accounts use` > `default`**.
The flag works before or after a subcommand; use `--` before literal arguments
that resemble flags. An unknown account is an error, never a fallback to another
account. Every command, including `login`, `logout`, `listen`, `daemon`, `doctor`,
media operations, and session import/export, uses this selection.

```bash
telegram-agent --account work listen --chat 12345
telegram-agent --account personal listen --chat 67890
TG_ACCOUNT=work telegram-agent chats list
```

Accounts can run concurrently. A process keeps its account for its whole lifetime,
so changing the saved default does not redirect existing listeners or daemons.
For automation, explicitly select the account on every invocation. JSON results
and streamed events include a top-level `account` field. For management commands,
this is the invocation's selection; the explicit profile being managed is named
in `data` (for example `data.name`, `data.added`, or `data.removed`).

`accounts list` is offline; `hasSession` means database files exist, not that they
are currently authorized. `accounts status` checks authorization only when the
account's daemon is already running. Use `--account NAME me` for a live check that
starts it if necessary. Login records a cached ID, name and username for listing.

Named profiles live in `~/.telegram-agent/accounts/NAME/`. `TG_APP_DIR` overrides
the root, not the selected profile directory. Each profile has its own TDLib
database, media/model caches, token, logs, and PID/port files. Services bind only to
loopback and choose available ports automatically. If setting `TG_DAEMON_PORT` or
`TG_CAPTION_PORT` explicitly, give each concurrently running service a unique port.

Application credentials are resolved from environment variables, then the selected
profile's `credentials` or `.env`, then root `credentials` or `.env`, then the
existing development/build defaults. Telegram login sessions are never shared by
this credential fallback.

Renaming/removing verifies and stops only that profile's services. A running
service that cannot be authenticated prevents the operation. Removal requires
`--confirm`; without `--logout` it deletes local files only and does not revoke
Telegram authorization. Revocation failure preserves the profile. Log out before
removing it, or revoke it in Telegram's Devices settings if necessary.

## Session portability

```bash
telegram-agent --account work session export | jq -r '.data.blob' > session.b64
telegram-agent accounts add restored --no-login
telegram-agent --account restored session import --stdin < session.b64
telegram-agent --account restored me
```

Exports and imports stop the selected Telegram daemon to avoid modifying a live
database. The next command restarts it. Import requires `--force` to replace an
existing database. Archives are validated before replacement and may contain only
regular files/directories under `tdlib_db`, up to 2 GiB expanded and 100,000 entries;
links and paths outside that directory are rejected. Older macOS AppleDouble
sidecars are tolerated. Use the same Telegram application credentials when moving
a session. An export is a credential; keep it private and do not run copies of the
same session concurrently on different machines.

## How It Works

A background daemon manages the TDLib connection and auto-starts on first command. TDLib caches your chats, messages, and user data locally, so most reads are instant (~0.2s) without hitting Telegram's servers. The daemon shuts down after 10 minutes of inactivity.

## Quick Start

```bash
telegram-agent me                              # Current user info
telegram-agent chats list --limit 10           # Recent chats
telegram-agent msg list @username --limit 5    # Message history
telegram-agent action send @username "hello"   # Send a message
telegram-agent msg search "keyword"            # Search across all chats
```

## Commands

### Identity

```bash
telegram-agent me                                # Current user info
telegram-agent info <id|username|phone|link>     # Detailed entity info
```

### Chats

```bash
telegram-agent chats list [--limit N] [--unread] [--type user|group|channel]
telegram-agent chats search "query" [--type chat|bot|group|channel] [--global]
telegram-agent chats members <chat> [--limit N] [--type bot|admin|recent]
```

### Messages

```bash
telegram-agent msg list <chat> [--limit N] [--filter photo|video|document|voice]
telegram-agent msg get <chat> <msgId>
telegram-agent msg search "query" [--chat <id>] [--type private|group|channel]
```

### Actions

```bash
telegram-agent action send <chat> "text" [--html] [--md] [--reply-to N] [--silent]
telegram-agent action edit <chat> <msgId> "text" [--html]
telegram-agent action delete <chat> <msgId...> [--revoke]
telegram-agent action forward <from> <to> <msgId...>
telegram-agent action pin <chat> <msgId>
telegram-agent action react <chat> <msgId> <emoji>
telegram-agent action click <chat> <msgId> <button>
```

### Media

```bash
telegram-agent media download <chat> <msgId> [--output path]
telegram-agent media transcribe <chat> <msgId>
```

### Real-time Streaming

```bash
telegram-agent listen --type user              # Readable live events in a terminal
telegram-agent listen --type user --json       # Stream events as NDJSON
telegram-agent listen --chat 12345             # Stream specific chat
```

### Daemon

```bash
telegram-agent daemon start | stop | status | log
```

### Auth

```bash
telegram-agent login                           # Log in to Telegram (interactive)
telegram-agent logout                          # Log out of Telegram
```

### Advanced

```bash
telegram-agent eval --confirm '<javascript>'   # Run reviewed JS with connected TDLib client
telegram-agent doctor                          # Verify installation health
```

## Entity Arguments

All commands accepting `<chat>` support:
- Numeric ID: `12345678`, `-1001234567890`
- Username: `@username` or `username`
- Phone: `+1234567890`
- Link: `t.me/username`
- Special: `me` or `self`

## Output

Command results use **tables and labeled details in a terminal**, with the selected
account displayed above the result. Compact lists such as chats, members, and tags
use tables. Messages and nested data use detail blocks with multiline text.
Account lists show a compact overview; `accounts status NAME` displays full details.
A stored session indicates local files, not verified authorization.

When stdout is piped or redirected, results keep the existing **compact JSON**
envelope, including `ok`, `account`, `data`/`error`, and pagination metadata.
Streaming uses one JSON object per line (NDJSON) in pipes. No script changes are
needed for existing JSON pipelines.

Use global flags before or after a subcommand to override detection:

```bash
telegram-agent accounts list                      # Readable account table
telegram-agent --account work chats list          # Readable chat table
telegram-agent msg list @username --limit 5        # Message details
telegram-agent --json accounts list               # JSON even in a terminal
telegram-agent chats list --pretty | less         # Readable output through a pipe
telegram-agent listen --chat 12345 --json          # NDJSON regardless of destination
telegram-agent chats list --unread | jq '.data[].title'
telegram-agent msg search "meeting" --json | jq '.data[].text'
```

`--json` and `--pretty` are mutually exclusive. Use `--` before literal arguments
that look like format flags. Prefer explicit `--json` in agents and integrations
that might allocate a terminal. For session exports, use JSON to retrieve the exact
credential blob (`.data.blob`); the readable view may wrap long values.

The readable format adapts to terminal width, falls back to detail blocks on narrow
screens, preserves multiline text and Unicode names, and shows empty results and
pagination explicitly. It uses Clack’s rounded borders, guide lines, cyan headings, and green status accents.
The selected account has a visible marker, including in monochrome. Color is enabled
only on terminal stdout and disabled by `NO_COLOR`, `NODE_DISABLE_COLORS=1`,
`FORCE_COLOR=0`, or `TERM=dumb`. Explicit `--pretty` in a pipe stays uncolored.
Control sequences from
Telegram content are neutralized for terminal display; JSON retains the original
values. Display formatting does not change existing command-level limits such as
search text previews (`--full` retrieves full search text).

Warnings remain on stderr, and results/errors keep their existing stdout channel
and exit status. Help and interactive login prompts remain human-readable.
`doctor` and `daemon log` retain their existing readable defaults; both accept
`--json` for structured output. `--pretty` also formats daemon logs as labeled details.

## Pagination

List commands return `hasMore` and `nextOffset`. Pass the offset back to paginate:

```bash
telegram-agent msg list <chat> --limit 50
telegram-agent msg list <chat> --limit 50 --offset-id <nextOffset>
```

## Claude Code Skill

Best suited for [Claude Code](https://docs.anthropic.com/en/docs/claude-code). Install the skill to give Claude full Telegram access:

```bash
npx skills add beautyfree/telegram-agent --skill telegram-agent
```

## License

GPL-3.0
