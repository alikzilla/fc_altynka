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
3. **Humanize the draft.** Always invoke the `humanizer` skill (`.claude/skills/humanizer`) on the draft file in embedded mode and write the result back to the same file. Apply its patterns to the Russian text the same way as to English: no «не X, а Y» contrasts, no closing line that only repeats the point, no lists of three for rhythm, no stock promo phrases. The writing rules below are the voice sample and win where the two disagree: keep the bold headline, the `•` bullets, the short closing remark when it adds a reaction, the occasional « — » joint (at the sample's rate: at most one or two per post), the «ты» tone and «ёлочки» quotes. Do not change facts, names of features, links or commands. Repeat this step after every edit the user asks for.
4. **Dry run.** This needs no token and sends nothing:

   ```bash
   pnpm channel:post <path>/post.html --button "Открыть приложение|https://t.me/fc_altynka_bot/fc_altynka_app"
   ```

   Fix every validation error it reports.
5. **Show the user the draft** exactly as it will appear (text, buttons, photo, whether it is silent or pinned) and wait for approval or edits.
6. **Publish** with the same arguments plus `--apply`. The command prints `message_id` and the public link.
7. **Record it** in `docs/channel-posts.md` (newest first): date, link, one-line summary. Give the user the link.

## Writing rules

The voice follows the tech channel Rozetked (`t.me/rozetked`): short news with a bold headline that already says what happened, a fact paragraph, a context paragraph, light irony aimed at the situation, never at the reader. Adapt the shape, not their content or wording.

**Who reads it.** Amateur football players and organizers, not developers. Say what changed for them. No commit hashes, file names, version IDs or words like «рефакторинг», «деплой», «миграция». A technical detail is fine when it explains the change in plain words («сервер переехал ближе к базе»). Only when the user asks for a technical part, add it as a separate paragraph for those who care.

**Headline.** The first line is bold and is the news itself, as a full statement without a final period: «<b>Страница матча открывается вдвое быстрее</b>», not «<b>Обновление</b>» or «<b>Важные новости</b>». Two other openings are allowed now and then: a short ironic line («<b>Мы посчитали секунды</b>») or a question hook in plain text when the reader recognises the problem («Тоже ждал, пока откроется матч?»). A follow-up to the previous post starts with «А также» or «Ещё».

**Body.** Two or three short paragraphs of one to three sentences:
1. The fact: what changed and where the reader will see it.
2. Context or the number that makes it concrete: why it was a problem, how much faster, what happens now.
3. Optional: a second fact introduced as «Ещё:» or a short list.

Use `•` bullets only for three or more parallel items (several small changes, steps, conditions). Never `-` or `*`.

**Ending.** Either what the reader can do now (with a button or an inline link on the words, not a bare URL), or a short remark of two to five words that adds a reaction and does not repeat the point («Бережём ваши нервы.» is out; «Секундомер можно убрать.» is fine). Never both a remark and a call to action in a row.

**Length.** 250–600 characters, median about 400. Longer only for a release with several changes or an album caption that carries a technical part (up to 1024).

**Tone.** Russian, informal «ты» (the same voice as the bot's own messages; Rozetked uses «вы», we do not). Neutral sentences for facts, one ironic touch per post at most. Colloquial words are fine in moderation («тормозил», «залипать»), slang and memes are not. No exclamation chains, no hype («невероятно», «революция»), no promises about dates the user has not confirmed.

**Numbers.** Always digits. Decimal comma («0,95 с», «1,3 секунды»), ranges with an en dash («35–63%»), «~» for approximations («~1 с»), a space before units («300 мс»). Round to what the reader feels: «вдвое», «примерно за секунду», with the exact figure once if it matters.

**Formatting.** Bold for the headline and, rarely, one key number. No italic, no hashtags. Emoji: none or one, never as bullets and never in the headline. Quotes in «ёлочках». Links as `<a href>` on meaningful words. For a correction to a published post, edit it and add a bold line «<b>Обновлено:</b> …» instead of posting again.

**Privacy.** Never name real players, quote group chats, or show amounts, phone numbers or screenshots with personal data.

**Telegram HTML only:** `<b>`, `<i>`, `<u>`, `<s>`, `<a href="https://…">`, `<code>`, `<blockquote>`. Write `&lt;`, `&gt;`, `&amp;` for bare symbols. A line break is a real newline, not `<br>`.

Example, single news:

```html
<b>Записаться на матч теперь можно прямо в боте</b>

На главном экране личного чата с ботом стоит ближайший матч и кнопка «Иду». Приложение открывать не нужно: бот сам скажет, попал ты в основу или в резерв.

Ещё он напишет, когда откроется запись на новый матч, и напомнит об игре за два часа. Уведомления включаются в /settings.
```

Example, several small changes:

```html
<b>Пара мелочей после прошлого матча</b>

• Игрок может привести на матч до трёх друзей, организатор — без ограничения.
• Получателем счёта можно выбрать того, кто сохранил номер Kaspi в профиле.
• Если Telegram подвисает, экран матча больше не падает с ошибкой.

Всё уже работает, обновлять ничего не нужно.
```

## Visual changes

When the post is about something players will see on screen, show it: by default one framed current screen with numbered callouts (a poster), a before/after pair only on request. Numbers and timings go into charts instead (see the `dataviz` skill).

1. **Capture from real builds.** The current screen is the current `pnpm build`; for a before/after pair, "before" is the same app built from the commit before the change in a temporary `git worktree` (symlink the root, `apps/miniapp` and `packages/core` `node_modules` into it). Serve each with `vite preview` on its own port and capture with the repo's Playwright Chromium at the phone's point size and 3× scale, with the API mocked like `tests/ui/*-fixture.ts`. Use invented names and placeholder numbers only, never production data.
2. **Frame them with the `device-frames` skill** (`.claude/skills/device-frames`): iPhone 17 geometry, vector case and screen clip, Dynamic Island, buttons. Leave ~54 pt above the app under the island, filled with the page's top colour, instead of drawing a fake status bar. Outline the changed block in the screenshot with the series colour (`#d95926` before, `#3987e5` after, validated for the dark surface).
3. **Compose one 1080 px wide dark card** (`#1a1a19`, Onest from `apps/miniapp/dist/assets`). Render at 2× and look at the PNG before showing it.
   - *Poster (default):* a label («НОВОЕ» for a new feature, «ИЗМЕНИЛОСЬ» for a change), a headline, one phone with the current screen on the left and two or three numbered callouts on the right (bold title + one line; for a change, one callout says what it was before). Each callout has a leader line to a dot on the screen. Take the dot positions from the page at capture time (`boundingBox()` of the elements, saved to `marks.json`), place dots on empty space next to the element, never on its text, and stack the callouts as one group centred on the dots. Examples: `artifacts/visuals/ceremony-new/`, `artifacts/visuals/bill-poster/`.
   - *Before/after:* only when the user asks for a direct comparison or the change cannot be explained by callouts on one screen: «БЫЛО» / «СТАЛО» labels over two phones and one short caption under each. Example: `artifacts/visuals/bill-receiver/`.
4. Remove the worktree and stop the preview servers. Keep the sources and PNGs in `artifacts/visuals/<topic>/` (`capture.mjs`, `frame.html`, `shoot.mjs`). Note that `artifacts/` is git-ignored: the examples live only on this machine.

## Command reference

```bash
pnpm channel:post <file|-> [--apply] [--photo <file|https url>] [--document <file>] [--album <image>]… [--button "Текст|https://…"]… [--silent] [--no-preview] [--pin] [--channel @name]
pnpm channel:post <file> --edit <message_id> [--caption] [--apply]
```

- Without `--apply` the command only validates and prints the plan.
- `--photo` turns the text into a photo caption, limited to 1024 characters instead of 4096.
- `--document` attaches a local file, for example a PDF with screens of the changes; the text becomes its caption with the same 1024-character limit. It cannot be combined with `--photo`.
- `--album` (repeat it for 2 to 10 local images) publishes the pictures as one album with the text as the caption of the first one, limited to 1024 characters. Telegram allows no buttons under an album, so put the link into the text as `<a href>`.
- `--button` may be repeated; each button takes its own row. Useful targets: the mini app `https://t.me/fc_altynka_bot/fc_altynka_app`, the bot `https://t.me/fc_altynka_bot`.
- `--silent` publishes without a notification sound; use it for minor notes and late hours (Almaty time).
- `--edit <message_id>` rewrites a published post (`--caption` if it is a photo post). The id is the last number in the post link. Use it to fix typos instead of posting again.
- There is no delete command on purpose: removing a post is done by hand in Telegram.

## Credentials

`--apply` reads `BOT_TOKEN` from `apps/worker/.webhook.env`, `apps/worker/.dev.vars` or the process environment, the same way `pnpm bot:profile` does. Never print the token, and never ask the user to paste it into the chat.

If the token is missing or `api.telegram.org` is unreachable (typical for a cloud session), stop after step 5 and give the user the exact `--apply` command to run on their machine, with the draft saved inside the repository working tree so they can reach it.

If Telegram answers `chat not found` or `not enough rights`, the bot is not an administrator of the channel with the right to post messages; tell the user to check that in the channel settings.
