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
state directory (`~/.telegram-agent/` or `TG_APP_DIR`). The CLI manages this token
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

Stop the existing daemon with `telegram-agent daemon stop` before using the new
CLI. If the optional caption daemon is running, stop its process too (its PID is
recorded in `caption.pid` in the state directory). Updated clients reject older
unauthenticated daemon health responses instead of falling back to them. Installing
an updated binary does not secure a process that was already running.

Health probes do not keep either daemon alive. Real requests reset the idle timeout;
active Telegram update streams and requests in progress defer automatic shutdown.
If a session may already have been exposed, revoke that session in Telegram's
Devices settings: updating or stopping the CLI cannot revoke a copied session.
