# Saved Messages reaction tags

Choose the account using the main skill’s account-selection rules. Replace `NAME` below with that profile and keep the same account throughout this workflow. Include it in any action approval.

Telegram Premium lets reactions on Saved Messages act as tags. Use them to create a personal, searchable library.

## Start with a small scheme

```bash
telegram-agent --account NAME saved tags
telegram-agent --account NAME saved tag-rename 🧠 "Ideas"
telegram-agent --account NAME saved tag-rename 📚 "Reading"
telegram-agent --account NAME saved tag-rename 💼 "Work"
```

`saved tags` returns tags in `.data.tags`. Keep the scheme small and explain a new tag before applying it broadly.

## Classify a reviewable batch

```bash
telegram-agent --account NAME msg list me --limit 50 | jq '.data.items[] | {id, date, text}'
```

Propose the mapping first, then apply approved tags:

```bash
telegram-agent --account NAME action react me 12345 🧠
telegram-agent --account NAME action react me 12346 📚
```

## Retrieve later

```bash
telegram-agent --account NAME saved search --tag 🧠 --limit 50
telegram-agent --account NAME saved search --tag 📚 --query "Rust"
telegram-agent --account NAME saved history --limit 50
```

Tag search uses one `--tag` or `--tag-custom` filter at a time. If Premium features are unavailable, keep using Saved Messages normally and do not promise that tags will work.

## Guardrails

- Reactions are an organisational change; show the proposed mapping before a large batch.
- Do not use `eval` or undocumented Telegram operations to bulk-edit Saved Messages.
- Treat a session export as a credential, not as a backup to paste into a chat.
