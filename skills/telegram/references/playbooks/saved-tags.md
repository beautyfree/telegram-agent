# Saved Messages reaction tags

Telegram Premium lets reactions on Saved Messages act as tags. Use them to create a personal, searchable library.

## Start with a small scheme

```bash
telegram-agent saved tags
telegram-agent saved tag-rename 🧠 "Ideas"
telegram-agent saved tag-rename 📚 "Reading"
telegram-agent saved tag-rename 💼 "Work"
```

`saved tags` returns tags in `.data.tags`. Keep the scheme small and explain a new tag before applying it broadly.

## Classify a reviewable batch

```bash
telegram-agent msg list me --limit 50 | jq '.data.items[] | {id, date, text}'
```

Propose the mapping first, then apply approved tags:

```bash
telegram-agent action react me 12345 🧠
telegram-agent action react me 12346 📚
```

## Retrieve later

```bash
telegram-agent saved search --tag 🧠 --limit 50
telegram-agent saved search --tag 📚 --query "Rust"
telegram-agent saved history --limit 50
```

Tag search uses one `--tag` or `--tag-custom` filter at a time. If Premium features are unavailable, keep using Saved Messages normally and do not promise that tags will work.

## Guardrails

- Reactions are an organisational change; show the proposed mapping before a large batch.
- Do not use `eval` or undocumented Telegram operations to bulk-edit Saved Messages.
- Treat a session export as a credential, not as a backup to paste into a chat.
