---
name: channel-post
description: Write and publish a post to the FC Altynka news channel (@fc_altynka_news) through the project bot. Use when the user asks to post, announce, publish news, write a release note or an update for the channel, or to edit a post that is already there.
---

# Post to the FC Altynka news channel

The channel `https://t.me/fc_altynka_news` carries project news for players and organizers: new features, changes in how the bot and the mini app work, planned downtime. The project bot `@fc_altynka_bot` is an administrator there and publishes through `scripts/channel-post.mjs`.

Publishing is public and notifies subscribers. Never run `--apply` without the user's explicit approval of the exact text in this conversation.

## Steps

1. **Find out what the post is about.** If the user named a topic, use it. If they asked for "what's new", read `docs/channel-posts.md` for the last published post, then `git log` after that date and the matching `docs/*-deployment.md`. Announce only what is already deployed to production. If you cannot tell whether a change is live, ask.
2. **Write the draft in Russian** following the rules below. Save it to a file in the scratchpad directory, for example `post.html`.
3. **Humanize the draft.** Always invoke the `humanizer` skill (`.claude/skills/humanizer`) on the draft file in embedded mode and write the result back to the same file. Apply its patterns to the Russian text the same way as to English: no «не X, а Y» contrasts, no closing line that only repeats the point, no lists of three for rhythm, no dashes as connectors, no stock promo phrases. The writing rules below win where the two disagree: keep the bold title line, the `•` bullets, the «ты» tone and «ёлочки» quotes. Do not change facts, names of features, links or commands. Repeat this step after every edit the user asks for.
4. **Dry run.** This needs no token and sends nothing:

   ```bash
   pnpm channel:post <path>/post.html --button "Открыть приложение|https://t.me/fc_altynka_bot/fc_altynka_app"
   ```

   Fix every validation error it reports.
5. **Show the user the draft** exactly as it will appear (text, buttons, photo, whether it is silent or pinned) and wait for approval or edits.
6. **Publish** with the same arguments plus `--apply`. The command prints `message_id` and the public link.
7. **Record it** in `docs/channel-posts.md` (newest first): date, link, one-line summary. Give the user the link.

## Writing rules

- Readers are amateur football players, not developers. Say what changed for them and what to do. No commit hashes, file names, version IDs or words like "рефакторинг", "деплой", "миграция".
- Russian, informal «ты», the same calm tone as the bot's own messages. Product names: «ФК Алтынка», «бот», «приложение».
- Shape: a bold title line, then two to five short lines or `•` bullets. Aim for 300–700 characters. One idea per post; several unrelated changes become a short list with one line each.
- Put the main point first. End with what the reader can do now, and add a button for it rather than a bare link.
- At most one or two emoji, and none is fine. No hashtags, no exclamation chains, no promises about dates that the user has not confirmed.
- Never name real players, quote group chats, or show amounts, phone numbers or screenshots with personal data.
- Telegram HTML only: `<b>`, `<i>`, `<u>`, `<s>`, `<a href="https://…">`, `<code>`, `<blockquote>`. Write `&lt;`, `&gt;`, `&amp;` for bare symbols. A line break is a real newline, not `<br>`.

Example:

```html
<b>Записаться на матч можно прямо в боте</b>

Открой личный чат с ботом: на главном экране теперь ближайший матч и кнопка «Иду». Приложение открывать не нужно.

• Бот сам напишет, когда откроется запись на новый матч.
• За два часа до игры придёт напоминание.

Чтобы получать сообщения, включи уведомления в боте: /settings.
```

## Command reference

```bash
pnpm channel:post <file|-> [--apply] [--photo <file|https url>] [--button "Текст|https://…"]… [--silent] [--no-preview] [--pin] [--channel @name]
pnpm channel:post <file> --edit <message_id> [--caption] [--apply]
```

- Without `--apply` the command only validates and prints the plan.
- `--photo` turns the text into a photo caption, limited to 1024 characters instead of 4096.
- `--button` may be repeated; each button takes its own row. Useful targets: the mini app `https://t.me/fc_altynka_bot/fc_altynka_app`, the bot `https://t.me/fc_altynka_bot`.
- `--silent` publishes without a notification sound; use it for minor notes and late hours (Almaty time).
- `--edit <message_id>` rewrites a published post (`--caption` if it is a photo post). The id is the last number in the post link. Use it to fix typos instead of posting again.
- There is no delete command on purpose: removing a post is done by hand in Telegram.

## Credentials

`--apply` reads `BOT_TOKEN` from `apps/worker/.webhook.env`, `apps/worker/.dev.vars` or the process environment, the same way `pnpm bot:profile` does. Never print the token, and never ask the user to paste it into the chat.

If the token is missing or `api.telegram.org` is unreachable (typical for a cloud session), stop after step 5 and give the user the exact `--apply` command to run on their machine, with the draft saved inside the repository working tree so they can reach it.

If Telegram answers `chat not found` or `not enough rights`, the bot is not an administrator of the channel with the right to post messages; tell the user to check that in the channel settings.
