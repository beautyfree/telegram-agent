<p align="center">
  <img width="20%" src="assets/logo.png" alt="telegram-agent" />
</p>
<h1 align="center">telegram-agent</h1>
<p align="center">
  Give your AI agent Telegram access. Read, search, send, download, and organise messages from a real Telegram account.
</p>
<p align="center">
  <a href="https://www.npmjs.com/package/telegram-agent"><img src="https://badgen.net/npm/v/telegram-agent" alt="npm version" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/npm/l/telegram-agent" alt="License" /></a>
  <a href="package.json"><img src="https://img.shields.io/badge/node-%3E%3D20-brightgreen" alt="Node 20+" /></a>
</p>

## Start here

Run one command:

```bash
npx skills add beautyfree/telegram-agent -g
```

Choose your AI app in picker. Then ask it something like:

> Check my unread Telegram messages

> Summarise @hackernews from today

> Find link about Cloudflare Workers in my chats

On first Telegram task, agent guides you through sign-in. No bot setup. It works with your normal Telegram account.

## What it can do

- Read chats, search messages, and catch up on channels
- Send, edit, forward, pin, delete, and react to messages
- Download media and transcribe voice messages
- Organise Saved Messages with reaction tags
- Monitor conversations and moderate channels

`telegram-agent` is a skill, not another always-on integration. Your agent loads it only for Telegram work, so it stays out of context for every other task.

## Security

This uses your Telegram user account, not a bot. Signing in creates a local session with same access as your account. Keep its files private and review actions that send, delete, or forward messages.

## Need details?

- [Install, sign-in, and troubleshooting](skills/telegram/references/installation.md)
- [All CLI commands](apps/cli/README.md)
- [Technical details, compatibility, and project history](docs/technical-details.md)
- [Security policy](SECURITY.md)

## License

GPL-3.0. See [LICENSE](LICENSE).
