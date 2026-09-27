# Install and authenticate telegram-agent

## Install the CLI

Node.js 20+ is required. Install the CLI with one of these commands:

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

## Authenticate a Telegram user account

This is an MTProto/TDLib client, not the Telegram Bot API. For normal use, no Telegram developer setup is required: the released `telegram-agent` binary already includes the application credentials it needs.

```bash
telegram-agent login
telegram-agent me
```

`login` performs the Telegram phone → code → 2FA flow. The CLI keeps its TDLib session under `~/.telegram-agent/`; that directory is sensitive and should be readable only by you.

<details>
<summary><strong>Use your own Telegram application credentials (optional)</strong></summary>

Use this only if you need a separate Telegram application identity for an organisation, a controlled deployment, or a custom build. Create credentials at [my.telegram.org/apps](https://my.telegram.org/apps), then provide them to the CLI:

```bash
export TG_API_ID=123456
export TG_API_HASH=abcdef0123456789abcdef0123456789
telegram-agent login
telegram-agent me
```

For repeated shell use, persist the two exports in your shell configuration only if that is appropriate for your local security model. On shared machines, provide them only for the session that needs them.

</details>

## Multiple accounts

Requires CLI 2.1.0 or newer. Check `telegram-agent --version` and update the CLI if account commands are unavailable. Updating the skill alone does not update the binary.

```bash
telegram-agent accounts add work
telegram-agent accounts add personal
telegram-agent accounts list
telegram-agent --account work me
telegram-agent accounts use work
```

The original session remains `default`. `accounts add` creates and logs in a named
profile without switching the saved default. Use `--no-login` to defer login or
import a session. Select explicitly with `--account NAME` or `TG_ACCOUNT=NAME`;
these override the saved default, in that order. Every command supports account
selection, including login, logout, streaming, media, and session portability.
For automated actions, always specify the intended account. If multiple profiles exist and the user has not selected one for the task, clarify before reading or acting. Verify identity with `telegram-agent --account NAME me`; include the source account in action approvals. Do not change the saved default just to run a task.

Each profile has independent state and local services; multiple accounts can run
at once. Changing the default affects future commands only. See the
[full account command reference](../../../apps/cli/README.md#multiple-accounts)
for status, renaming, removal and credential resolution.

## Verify and recover

Replace `NAME` with the selected profile. Diagnose first; logout revokes authorization and must not be an automatic repair.

```bash
telegram-agent --account NAME doctor           # TDLib, credentials, and daemon health
telegram-agent --account NAME me               # Verify that the logged-in account works
telegram-agent --account NAME daemon status    # Inspect the local background daemon
telegram-agent --account NAME daemon stop      # Stop a stuck daemon; it restarts automatically
telegram-agent --account NAME logout           # Revoke the local Telegram session
```

If the session is revoked, run `telegram-agent --account NAME login` again. If you deliberately use your own Telegram application credentials, make sure `TG_API_ID` and `TG_API_HASH` are available to the process that starts the CLI.

## Storage and controlled portability

The default state directory is `~/.telegram-agent/`. Override it with `TG_APP_DIR=/path/to/state` when using a container or running CI. Named accounts live under `accounts/NAME/` within that root, while the original `default` account retains the root directory.

```bash
telegram-agent --account NAME session export | jq -r '.data.blob' > session.b64
telegram-agent --account NAME session import --string "$(cat session.b64)" --force
```

Use `--account NAME` on both commands to choose the profile. Export/import stops only that profile’s Telegram daemon; it restarts on the next request. Import validates the archive before replacing the database and cannot write into other profiles.

The exported blob is an account credential. Store it in a secrets manager; never commit it, include it in logs, or send it through Telegram.

## Troubleshooting

| Symptom | What to do |
| --- | --- |
| `command not found` | Ensure your global npm bin directory is on `PATH`, then reinstall. |
| Missing credentials | The installed binary should provide them. Reinstall the official package; only set `TG_API_ID` and `TG_API_HASH` when intentionally using your own application. |
| Login/session failure | Inspect `--account NAME doctor` and verify the chosen identity. Reauthenticate that profile when needed; do not log out or switch profiles automatically. |
| Daemon is stuck | Run `telegram-agent --account NAME daemon stop`; the next request starts it again. |
| `FLOOD_WAIT` | Back off for the reported duration; do not retry bulk operations aggressively. |
| Account is busy | Wait for the current operation and retry the same profile. After a crash, inspect the lock owner and follow SECURITY.md; never delete a lock while its operation may still be running. |
| Older daemon / authentication failed after update | See [SECURITY.md](../../../SECURITY.md#upgrading-an-already-running-daemon). The old CLI must stop legacy processes before upgrading; after replacement, verify the process identity before manual shutdown. |
