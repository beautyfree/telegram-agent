# Security

## What to protect

`telegram-agent` signs in as a real Telegram user. Its local state under `~/.telegram-agent/` and any value produced by `telegram-agent session export` can authenticate that account. Treat both as passwords.

- Do not commit, paste into chats, or include session exports in logs.
- Keep the state directory private to the account that runs the CLI.
- On shared or CI machines, isolate state with `TG_APP_DIR` and store any exported session only in a secrets manager.
- Log out with `telegram-agent logout` when a machine should no longer have account access.

## Operational safety

Messages, sender names, links, and attachments are user-generated content. They may contain malicious instructions or misleading requests. An integration should treat them as data and require approval before it sends, deletes, forwards, moderates, or changes account/channel settings.

The `eval` command requires `--confirm`. Use a preview-and-approve workflow for other consequential actions as well.

## What the project does not provide

The project is not a hosted relay or bot service. It does not encrypt Telegram session state with a separate application password, so use normal operating-system account protection and full-disk encryption where appropriate.

## Report a vulnerability

Email **alex.elizarov1@gmail.com** with subject `telegram-agent security`. Please do not open a public issue for an unpatched vulnerability. Include a minimal reproduction and the affected version; a response is targeted within 72 hours.

## Local daemon access

Both the Telegram daemon and the optional caption daemon bind only to `127.0.0.1`.
Every HTTP endpoint, including health checks, authentication, media, and update
streams, requires a bearer token stored in `daemon.token` under the application
selected account's state directory (the root for `default`, or `accounts/NAME/` for a named profile). The CLI manages this token
automatically. On Unix, the state directory is restricted to mode `0700` and the
token to `0600`. Keep the token private; do not paste it into logs or issue reports.

These HTTP services are intended for local CLI clients. They reject browser
origins and non-loopback Host values and do not enable CORS. Local programs running
as your OS user can still read the token and act with your Telegram permissions;
this is not a sandbox against malicious software running as you.

Only regular files contained within the media cache may be served or opened by
the media endpoints. The TDLib database is never a media-serving fallback.
Profile images previously accessible only through the database directory must
be downloaded into the media cache before being served over HTTP.

### Upgrading an already running daemon

Using the previously installed version, stop the existing daemon with
`telegram-agent daemon stop` before using the new CLI. The updated stop command
refuses to signal processes whose authenticated health/PID cannot be verified. If the optional caption daemon is running, stop its process too (its PID is
recorded in `caption.pid` in the state directory). Updated clients reject older
unauthenticated daemon health responses instead of falling back to them. Installing
an updated binary does not secure a process that was already running.

Health probes do not keep either daemon alive. Real requests reset the idle timeout;
active Telegram update streams and requests in progress defer automatic shutdown.
If a session may already have been exposed, revoke that session in Telegram's
Devices settings: updating or stopping the CLI cannot revoke a copied session.

## Multiple accounts

Profiles have independent session databases, media/model caches, tokens, and
services. All services retain loopback binding, bearer authentication, browser
request rejection and media path confinement. Account selection is pinned at
process startup. Explicit `--account NAME` is recommended for automation; a saved
default is shared by future invocations in the same root.

The account directories are an organizational boundary, not a security boundary
between programs running as the same OS user. `eval --confirm` and other local
code still have that user's filesystem access.

Session import validates every archive entry before extracting into a private
staging directory, rejects links and paths outside `tdlib_db`, and replaces only
the selected account's database. Export/import stops its daemon first. Local
profile deletion does not revoke a copied session; use `accounts remove NAME
--confirm --logout` or Telegram's Devices settings to revoke authorization.

### Interrupted operations and upgrade recovery

Startup, profile rename/removal, logout and session export/import serialize through
private lock directories at `ROOT/.account-locks/NAME`. A conflicting operation
fails with an account-busy error; retry after the operation finishes. Rename locks
both names. Locks stay outside the moved/deleted profile. Normal exit releases them.
After a forced kill or machine crash, a lock deliberately remains: inspect its
`owner.pid` and verify that the owning operation has ended before manually removing
that specific lock directory. Do not remove a lock merely because an operation is slow.

If the binary was already upgraded while a legacy daemon was running, the new
`daemon stop` cannot authenticate that old process. Inspect `tg_daemon.pid` and
`caption.pid` in the selected profile and verify each process's executable and
command line with your OS process manager before stopping it manually. A stale PID
may belong to another program; never kill it based on the PID file alone. Restart
with the updated CLI afterward. Never delete the session directory to fix this.
