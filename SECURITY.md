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
