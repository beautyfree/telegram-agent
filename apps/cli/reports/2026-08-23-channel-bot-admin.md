# Channel bot administration

**Commands used**: chats members, eval

## Issues

- TDLib exposes `setChatMemberStatus`, but the CLI exposed no safe command to add a publishing bot to a broadcast channel.

## Suggestions

- Provide `chats add-bot <channel> <bot> --confirm`; limit it to broadcast channels and grant only `can_post_messages`.
