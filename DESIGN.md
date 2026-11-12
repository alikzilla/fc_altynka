---
name: FC Altynka
description: A football companion with coloured Airofit surfaces, pearly controls and explicit dark/light themes.
colors:
  bg: '#08090b'
  card: '#19191f'
  text: '#f2f1f8'
  hint: '#b6b2c2'
  accent: '#ded5f4'
  on-accent: '#191c30'
  plum: '#240b24'
  blue: '#0a1230'
  coral: '#2d1111'
  line: '#38343f'
  danger: '#ffb8c6'
---

# FC Altynka design system

The user approved the Airofit material iteration and requested its implementation. This direction replaces the earlier Floating Glass design, including its ambient gradient background and sliding navigation lens.

## References and intent

Dropset supplies the quiet dark foundation and clear hierarchy. Airofit supplies coloured curved surfaces, inner edge lighting and pale controls. Revolut informs the separation of primary actions, obligations and account details. The approved visual source is `artifacts/reference-redesign/airofit.html`; implementation lives in `apps/miniapp/src/styles/app.css`, with theme overrides in `apps/miniapp/src/styles/themes.css`.

The page background stays solid: `#08090b` in the default dark theme and `#f4f2f7` in the selectable light theme. Colour and gradients belong to individual surfaces. There is no backdrop blur. The account's explicit theme preference controls the app and supported Telegram header/background/bar colours; Telegram theme changes do not override it. A local cache applies the preference before account loading. Light mode uses dark ink, pale neutral surfaces and a pale dock, while plum/blue/coral material cards keep their light text and coloured identity.

## Materials

- Plum: the first upcoming match and match details. A pink upper rim, deep plum centre and soft curved lower edge.
- Blue: the next match, scheduling tasks and club profile settings. A lavender upper edge, dark blue centre and softly lit corners.
- Coral: contribution tasks and personal payment. Dark warm centre and coral lower edge.
- Graphite: archive lists and secondary management content.

Each material is opaque. Inner shadows simulate the user-requested curved edge. Body text remains light over quiet dark portions. Colour identifies an object/category; it does not imply overdue, bank verification or success.

Primary buttons use a pale pearly fill with dark text. Coral surfaces receive a warm pearl variant. Secondary buttons are darker. Buttons have at least 48 px height, pill corners, visible focus and short press feedback. Destructive actions retain explicit text and confirmation.

## Typography and frame

Apple system stack with bundled Onest Variable fallback, optical sizing enabled. Screen titles 28 px / 600, 27 px below 360 px; section headings 18 px / 550; body 16 px; metadata 12–14 px. Navigation labels are 12 px; 12 px is the text floor everywhere. The home match cards lead with one 44 px / 550 answer (38 px on narrow phones) under a quiet 14 px date. Dates, amounts and roster counts use tabular figures.

One centred column caps at 440 px, with 20 px gutters and 16 px below 360 px. Content groups use 20 px gaps. Cards use approximately 30 px corners; the featured match uses 37 px and 21 px padding. Device and Telegram safe areas are included. At least 148 px plus bottom inset is reserved for the fixed dock.

## Navigation and screens

Nested screens support Back with an inward horizontal swipe starting within 24 px of either canvas edge. The gesture shares the Telegram Back action; it never uses external browser history. A small arrow follows the pull and changes tone at the commit threshold. Root tabs stay in place. Vertical scrolling, carousels, tabs, inputs, cancellation and multitouch retain their own behavior. An open creation sheet owns Back and blocks it while saving. Reduced motion uses a stationary arrow.

Screens start directly with the page title at the standard safe-area inset. There is no separate club header, rotating football greeting, logo or avatar above it. Profile editing actions appear directly below its summary; the profile title has no decorative icon or action on its right.

Everyone has the same dock: Главная, Матчи, a central menu button, Задачи, Профиль. The central button (nine dots; «Главная» already uses four tiles) opens the menu as a pop-up card, not a bottom sheet: a rounded card (28 px corners, up to 380 px wide) springs out of the button over 340 ms, sits 14 px above the dock and points at the button with a small caret, while the dots turn into a cross. The dock stays visible; the rest of the screen is dimmed. Sections without a dock slot are icons with a label under each, four per row, on the app's materials (62 px tile, 22 px corners; 54 px below 360 px). «Создать матч» is pearl and shown only to someone who can create a match; «Статистика» is plum, «Игроки» blue, «Площадки» coral. A tap outside the card (the dock included), Escape or Back closes it in 160 ms and focus returns to the central button; choosing an icon closes it at once. Reduced motion shows and hides it without animation. Creation and role/name management are role-gated. The player directory and sports profiles are available to every community member. The dock caps at 416 px, sits 16 px above the safe bottom, has 32 px corners and an opaque blue material. The central pearl control is 52 px. Selection lights the icon; there is no moving lens. A small dot identifies real pending tasks and is hidden if task refresh fails.

The app opens without a current team: there is no team chooser and no «Сменить» bar. Home, Matches and Tasks merge the person's matches from all groups. A group tag (coloured dot plus group title) appears on match and task cards and rating-history rows only when the person belongs to more than one group; with one group the interface looks as before. Organizer rights are per match, taken from the person's role in that match's group. With zero groups the profile still opens, feeds are empty and explain how to connect: add the bot to the Telegram group as an administrator allowed to pin messages, then reopen the app; «Добавить в группу» opens that flow. Players is titled «Игроки» and, with more than one group, splits into sections headed by the group tag; role management appears only in groups the person administers.

Home leads with active collecting/scheduled matches, sorted by date/id. Native scroll snap, keyboard-accessible links and explicit previous/next controls operate the carousel. A single match uses the full available width. Open bills do not replace signup cards. Personal tasks follow, then next games or the latest billed/closed/cancelled match.

Home ends with «Лента»: independent graphite cards, one per post, 12 px apart, like posts in a social feed. A card has a head row (46 px round icon, the kind of news in 14 px semibold such as «Герой матча», a 12 px day label «Сегодня» / «Вчера» / date) and 16 px text below where player and team names are semibold. A team post tints the icon with the kit colour. A post about a player is signed by that player: the 46 px avatar (Telegram photo or initials) replaces the icon, the name is the bold line and «kind · day» sits under it. The head and text form one target. A post about a player is a button that opens the sports profile in the shared ActionSheet over Home, without leaving the screen and never through the player directory page; other posts are links to the match. Below the link, outside it, sit three small reaction pills with native emoji 🔥 👍 👎, 34 px tall and at least 44 px wide, each with its count when above zero. The person's own reaction has an accent tint and ring; tapping it again removes it, tapping another replaces it. The tap shows immediately and a failed save restores the true counts with a toast. While a post has no reactions the row holds one quiet pill «Реакция» with a smile glyph; tapping it replaces it with the three pills, which pop in left to right with a 55 ms stagger (340 ms, slight overshoot) and focus moves to the first. Rows that load with reactions do not animate; reduced motion shows the pills at once. For a person with several groups the group is a quiet caption (dot and title in hint colour, no pill) at the right end of the reaction row; the head stays clear. While the feed loads for the first time, three placeholder cards with the same head, two text lines and reaction pill hold its place, in the route skeleton as well. A group admin sees a ⋯ button in the card's top-right corner, 14 px from the edge and outside the link; it opens the shared ActionSheet with the post's text and one destructive action «Удалить пост», which asks once more before removing the post for everyone. Five posts show first, «Показать ещё» reveals the rest in place. The section is absent while there are no posts, and it sits last so its arrival never moves other content.

«Статистика» (`/stats`, opened from the menu) is one leaderboard. With more than one group, a scrollable chip row filters it: «Все игроки» (a person is summed over the shared groups and appears once) or one group with its coloured dot; with one group the row is hidden. A segmented control picks the board: Голы, Пасы, Гол+пас, Игры, Победы. The top three stand on a podium ordered 2–1–3 as opaque gold, silver and bronze materials with light text in both themes; gold is taller and its place and value use the medal ink. The place is always written («1 место»), colour never carries it alone. With fewer than three players there is no podium. The rest is a graphite list: place, avatar, name, «N матчей · рейтинг X,X», value; one's own row uses accent ink. Unknown assists show «—». A row or a podium card opens that player's profile sheet.

«Площадки» (`/venues`, opened from the menu) shows the venue catalogue of each of the person's groups; with more than one group each section is headed by the group tag and a count. A venue is a graphite card: a 44 px coral pin tile, name, address («Адрес уточняется» when empty), the map link on the left and the hourly price on the right («Цена уточняется» when empty). Everyone can view. In a group the person organizes, each card ends with quiet «Изменить» and «Удалить» (inline confirmation; matches that already name the venue do not change) and the section ends with «Добавить площадку»; adding and editing reuse the venue form sheet from scheduling. An empty group says who can add venues; with no groups the page explains how to connect one.

Matches has Active and Past tabs with URL state and keyboard support. Active shows collecting/scheduled matches in ascending date order. Past groups billing/closed/cancelled matches by month and loads 20 at a time with retry that retains previous pages. Refresh invalidates older pages and discards stale pagination responses. Task cards link to the existing bill or scheduling route; successful mutations and app return refresh obligations and match lists. Payment detail also refreshes on return from an external app.

Creation opens a native bottom sheet over the current screen; the background tab/query and scroll context are retained. It uses the same opaque graphite material, 32 px top corners, safe-area footer and a 240 ms upward entry with a faster downward exit. A visible grabber and the header support touch/mouse dragging. Pulling down from unoccupied content at scroll-top also dismisses; upward/ongoing scrolling and form controls retain native behavior. Short, horizontal, cancelled and multi-pointer gestures reset cleanly. A gesture starting inside cannot become a backdrop click. Viewport resize adjusts keyboard clearance. Telegram vertical minimize swipes are temporarily suspended on supported clients and restored on cleanup. The title receives focus without opening a mobile keyboard. Tab stays inside; Escape, backdrop, close and Telegram Back dismiss it. During submission controls are locked. Date, optional comment and, only for a person who can create in more than one group, a native «Группа» select fit one step. With a single creatable group there is no group field and the submit reads «Создать матч»; with several, the select lists every group, nothing is preselected and «Открыть запись» stays disabled until a group is chosen. A person with no groups at all sees the connect-bot instruction and «Добавить в группу» instead of the form; a person whose groups are all player-only sees «Создавать матчи может организатор группы…» (ask a group admin for the organizer role), the secondary line about connecting their own group, and the same button; failures preserve input. Success closes the sheet and opens Active matches. Browser Back may leave a pending request; its late response must not navigate the person away from their new screen.

Match details lead with day/month and weekday, followed by one plum card: prominent time, venue, roster count, short match status and personal participation. Participation remains visible on Участники, Составы and Оплата; the existing list/teams/bill query values remain compatible. There is no permanent step indicator. The organizer note sits before the roster. Main and reserve lists remain separate; a reservist sees their queue position. Изменить opens an explicit exit action; organizer cancellation stays in a separate confirmed menu, and player management opens from each row's contextual menu.

One contextual primary action is fixed 12 px above the navigation dock: join/reserve, schedule, split/publish teams, or open/submit the bill form. Scheduling takes priority for an organizer while collecting; their own signup remains available in the card. Content has extra bottom clearance when this action exists. Native action sheets own Back, trap focus, restore the trigger, and block dismissal during a pending mutation. Kaspi is the exception: its transfer button stays inside the coral payment card. The card leads the bill tab and always reserves a status line (К оплате, Доплатить or Ты отметил оплату), so marking payment does not move the amount and recipient. Amounts can be copied through the adjacent copy affordance. Closed bills expose no new transfer/mark actions, and receivers have no personal obligation card. Expenses and payer lines follow. A payment mark is the member's declaration, not bank verification; correcting paid lines retains existing receiver/organizer permissions.

Time and duration are required before a new bill can be issued, enforced server-side and explained with an appointment action in the bill tab. Venue is optional. Scheduling is read-only after billing/cancellation/closure. Bill creation and editing open in a native bottom sheet over the unchanged Payment tab. The form scrolls independently, and its submit footer remains at the bottom of the sheet, above keyboard/safe-area clearance. Pending submission locks dismissal; closing restores trigger focus. Drafts preserve amounts on refresh and only submit currently present selected signups. Closed matches and legacy bills remain readable. Team publication rejects a stale roster or closed match. Published teams identify the member's own team. Player names open sports profiles; public decimal ratings replace the previous hidden levels. Saved teams retain a rating snapshot.

Transient notifications appear at the safe top inset throughout the app, above content and clear of the fixed action and bottom navigation. The persistent Задачи destination remains in the dock.

Profile displays verified Telegram photo, full name and username. Missing or broken photos use initials. Editable club display name and Kaspi phone remain separate. Authorized users reach player management from profile.

The approved sports profile uses a 72px avatar (60px below 360px), name, then one line: role emoji · Telegram handle. The line never wraps; a long handle ends with an ellipsis and keeps the full value in `title`. Player ⚽️, organizer 🧑‍✈️, administrator 🧑‍💻 use native Apple Color Emoji on Apple devices and native fallback elsewhere. The rating is a continuous ring without a visible caption: level 1 grey, 2–3 green, 4–7 yellow, 8–9 orange, 10 red, following inspected FACEIT assets. Fractional values remain precise; whole values omit the decimal zero. The ring opens a sheet with five continuous examples.

An inset panel contains the position above five cells: goals, assists (a real count once any of the player's games recorded passes, «—» before that), short games, win percentage, working foot. The foot uses two mirrored insole silhouettes without toes; active opacity 1 and inactive .25. Achievements and played meetings follow the card as two graphite cards, then existing profile editing/system settings and player management. «Достижения» shows one pinned achievement: a 76 px opaque hexagon medal in its tier colour (60 px below 360 px; no glow), «Закреплено», the name, the tier line («Золото · 64 гола») and a thin bar to the next tier («До платины 64 / 100»; «Максимальный уровень» at the top). With nothing pinned the slot is an empty dashed hexagon: on one's own profile «Закрепи достижение, чтобы его видели другие» opens the list; on a peer profile «Ничего не закреплено» is inert. «Все 5 ›» opens the list in the shared ActionSheet («Уровней открыто: X из 35»); a row opens a nested sheet with the seven-tier ladder (Дерево, Бронза, Серебро, Золото, Платина, Алмаз, Легенда; future tiers dimmed but readable) and, on one's own profile only, «Закрепить в профиле» (disabled at level 0 or when already pinned). The tier is always written out; colour never carries it alone. «Сыгранные матчи» lists the three latest meetings as rows: date, one dot per short game (win green, draw grey, loss pink) and goals; the group tag appears only when the history spans several groups. «Все N ›» appears above three meetings and opens all rows in the shared ActionSheet. A row opens the short-game history, which also carries the meeting rating and place. Peer profiles use the same sports content and retain their own sheet, without personal settings. Statistics loading does not invent zeros; empty confirmed profiles show actual zero counts. Per-user totals come from saved protocol identities, never current display names or guessed guest links.

Scheduling opens in the shared ActionSheet over the current match and retains its tab.
The venue field is a button opening a second ActionSheet; it never opens a keyboard.
The catalogue belongs to the group: the picker lists its venues and ends with «Добавить площадку»,
which swaps the picker for the «Новая площадка» form (name required; address, https map link and
hourly price optional) and returns with the new venue selected. Each card has a quiet «Удалить»
that asks for confirmation inline; deleting never changes matches that already name the venue.
The map link appears only when a link is saved («Открыть в 2ГИС» for 2GIS, otherwise «Открыть на карте»).
Below duration the sheet offers the match format as four chips in the same two-column grid
(5×5, 6×6, 5×5×5, 6×6×6 with the squad size underneath); duration suggests a format only until one is picked.
Unknown address and tariff stay explicitly unspecified. A known tariff uses
`18 000 ₸ / час` on one unbroken line. Explicit selection returns to the appointment
draft without resetting time/duration; dismissing keeps the existing venue, including
legacy free-text names. Background refresh does not overwrite the draft. Pending
save locks controls/dismissal, and late responses after navigation cannot redirect.
Nested sheets share the body scroll lock and restore the venue trigger's focus in
WebKit as well as Chromium. The match menu closes before opening scheduling.

## Accessibility and states

The game tab is built from materials: the current game is a blue card «Игра N» (no duration hint) with two kit discs, team names, points so far and «VS», a chip «Отдыхают …» (three teams) or «С мячом начинают …» (first game of two teams), and “Внести результат” with «⋯». Таблица, Последние игры and Бомбардиры are graphite cards; table rows have no highlight. Each history row shows the score in a pill with the winner bold and the scorers in two columns under their own teams («—» when a team did not score), the assister in brackets: «Алихан (Дамир)». The top scorer has a gold medal. The result sheet calls the block «Голы и пасы»: once a goal has an author, a dashed second line «↳ Пас: выбрать» opens that team's players without the author plus «Без паса»; changing the author clears a pass that became invalid. Score entry uses compact 44px minus/plus buttons with a fixed numeric column, and a clear gap between the teams. Every goal has an author card; opening it lists only that team's players, including disambiguated guests. Unknown authors are allowed. Removing a goal removes its final card and attribution. Card order and unknown positions survive draft recovery without changing retry command identity. Legacy overassigned drafts offer an explicit repair action. Match-page figures and game/history sheets use tabular numerals. The page shows the latest three games newest first; “Все матчи” opens the full history in the shared ActionSheet, with organizer-only edits and focus restored to the originating row.

Real links/buttons, one h1, named regions, visible focus, keyboard tabs, readable error/empty/loading states. All content can scroll clear of the dock. Reduced motion disables animation/travel. Increased contrast flattens materials and adds clear edges. Materials are already opaque, so reduced-transparency preferences do not depend on browser blur support.

Skeletons copy the loaded screen: the same cards with the same materials, paddings, radii and row heights (`components/skeletons.tsx`, `styles/skeletons.css`), so nothing moves or changes colour when data arrives. Fixed labels («Достижения», «Голы», «Основа», form labels) stay as text; only data becomes bars. A bar sits inside the element that holds the text and has zero layout height, so the line keeps that element's own height. Bars are #35313f on graphite and default cards, #e0d8e8 in light mode and translucent white on plum, blue and coral. Avatars, buttons and icons keep their shape in the bar colour. Before the account loads, and while a screen's code loads, the frame shows that route's title and its card silhouettes. Content that replaces a skeleton fades in over 220 ms in place, without travel; cached content appears at once and reduced motion disables the fade. A sheet keeps one surface from skeleton to form, so it slides in once. Skeleton graphics are hidden from assistive technology; a single status describes each loading resource. Existing content stays visible while refreshing. `tests/ui/skeletons.spec.ts` checks that skeleton cards occupy the same boxes as loaded ones; when a screen's layout changes, change its skeleton too. Match step indicators use #26232e/#40334f.

Form controls and their flex/grid parents have a zero minimum width and are bounded to their content column. `TemporalInput` places the 50 px frame, border and padding on a wrapper around a native date/time input; the native control has no padding, avoiding iOS WebKit's percentage-width sizing bug. Focus is drawn around the whole frame. Native value editing and validation remain available. Selects use a consistent chevron and appearance reset, preserving the 50 px form height (44 px for compact guest levels) on WebKit; long selected values truncate within the control. Checkbox controls do not inherit text-field padding.

The profile shows Telegram identity and a compact football summary (primary playing position and dominant foot). Name/Kaspi setup appears until the first accepted save; completion lives on the server and remains complete after a phone is removed. Returning users edit their number through the direct payment action, alongside name and football actions. Football values stay unspecified until chosen and can be cleared. Native selectors retain the shared form sizing; submitted setup fields are disabled while saving, and failed saves retain drafts. Name, payment and football settings open as bottom sheets over Profile (`/profile/settings/:section` keeps deep links); closing or saving returns to `/profile` and Profile navigation stays active throughout.

Profile identity and football details share one plum card. Its upper row places the avatar on the left, with name, Telegram handle and account role on the right. A divider separates the football information below: position and dominant foot share one two-column row, including on narrow phones. Position and dominant foot are edited from the card itself: a text link «Изменить» sits opposite the position title (space-between, 44 px hit area) and opens the «Позиция и рабочая нога» sheet. Настройка профиля contains two direct graphite actions: Изменить имя, Изменить оплату. They use the same icon/copy/chevron format as organizer controls. Системные настройки contains two accessible switches, Уведомления and Тёмная тема. Notification permission recovery stays adjacent to its switch when necessary. Игроки команды is available to everyone: under Управление for organizers/admins and Команда for players. Role and club-name controls appear only for admins, separately from sports profiles.

Synthetic images and data appear only in visual artifacts and tests. Real API data is authenticated with signed Telegram initData and scoped to the current group/user. Physical-device Telegram validation is separate from browser tests.

## Empty content

Empty states stay in the content flow: left-aligned 17 px heading, short 14 px explanation, optional contextual action with natural width. No decorative icon tile or large centre-aligned poster. Keep the layout and tabs intact; distinguish things the person can create from things they must wait for. Home omits its tasks section when no tasks remain. Empty archive/notifications/teams/player lists use the same quiet treatment. No fabricated matches or sample content.

## Playing skills and match reviews

The first ordinary app entry offers a dismissible bottom sheet linking to `/profile/skills`.
Dismissal lasts for the session; the profile and tasks retain the questionnaire action.
Eight questions use a shared native 1–10 range slider, a progress bar, clear scale
anchors and an unselected initial state. A large number rolls vertically on a damped spring
that preserves its position and velocity during reversals. The thumb tracks directly; keyboard
changes and reduced motion settle immediately. Next stays fixed above the dock. Back preserves
answers. The final summary precedes
an explicit immutable save; failed requests retain all answers.

Profile places the decimal rating directly below the photo/name row inside the plum identity
card, alongside a short source/count label. Position and dominant foot follow below the rating. There is no separate rating card or self-assessment card in own/public profiles. Published
match averages follow (including insufficient-data states). The initial-result screen retains
its existing rating summary and answer breakdown. There are no fabricated rating trends.
`/players` lists names, positions and decimal ratings with name search; `/players/:userId`
opens the sports profile in the shared ActionSheet. Names in participant and published-team
lists also open the same sheet. Sports profiles never expose Kaspi or private account settings.
The Profile dock destination remains selected on player-profile routes.

After kickoff, an organizer can confirm actual participants using a separate finish sheet.
Main players are preselected; reserve players and guests can be included. A fixed footer
confirms the immutable snapshot. This does not close the bill. The match then links to an anonymous questionnaire page with a question card and a rating-entry
card. Оценить opens an ActionSheet, showing one peer at a time on the shared slider with
contextual scale descriptions. Changing or releasing the slider updates only the draft score. Далее explicitly confirms
the choice and slides the next peer in from the left, while the previous one leaves right.
Neither pointer release nor Enter on the slider advances; keyboard users activate Далее. Skip and Back remain available. The game is rated last,
followed by explicit final submission. Closing the sheet retains the page draft; a failed submit
retains all scores. No self-score control is shown. Submission is final. The server closes voting after 72 hours;
only aggregates with at least three votes are published. Loading, retry and expired states
retain navigation and use existing components in both themes.

The rating slider uses the browser's native drag tracking. It deliberately does not call
setPointerCapture: that interferes with WebKit's native mouse tracking. The existing sheet and
edge gestures exclude interactive inputs. Slider focus rings leave room for endpoint labels.

## Team composition and actual kit colors

The organizer's team tab (2026-11-10) leads with one blue «Баланс команд» card: a full-width
«2 команды / 3 команды» control, one bar per team (kit colour, average rating), «Разница средних — X»
and a full-width «Перемешать» in the secondary-on-material style. Shuffling and changing the team count
apply at once, without a confirmation sheet; undo lives in the toast and beside the main action. The
shuffle glyph flips top-to-bottom (its arrows cross) instead of spinning, so it never snaps back.
Graphite team cards follow: a shirt in the kit colour, name, «N игроков · среднее», a «Форма» chip,
and players sorted by rating with the rating coloured like the rating ring. A guest's rating is a
dashed button that opens a 1–10 level sheet. Swapping is two taps: the first player gets a soft
accent fill (no outline) while their teammates dim and rows of other teams show a swap glyph; the
fixed panel becomes one row «⇄ Обмен: Имя» + «Отмена» (long names truncate); tapping a player of
another team swaps them, Escape or «Отмена» cancels. Rows in the editor do not open profiles. The fixed
panel shows «Черновик — видишь только ты» / «Есть неопубликованные изменения» + «Опубликовать составы»,
then «Опубликованы — видят все» + «Начать матч»; before match day it shows only the status and «Начать
матч можно в день игры». Players see the same graphite cards without ratings or controls, their own
team first and marked «Твоя команда». The shared ToastProvider shows
change feedback with an optional Отменить action for eight seconds, pausing on hover/focus;
ordinary notifications retain 2.5 seconds and errors 6 seconds. Both live regions stay mounted (polite `status` and assertive error region) so screen readers announce the text when it arrives. Toast edges align with content at narrow widths too.

The kit sheet «Форма: <команда>» edits one team: six shirts with labels, «сейчас» on the current colour
and «у Синих» on a colour another team wears. A choice applies at once and closes the sheet; an occupied
colour swaps the two teams' colours without moving players. Before kickoff the card chip edits the draft
(published with the lineups); inside the start sheet it saves immediately with the colour revision. New semantic dots: green #86c8a2, white #e8e8ee, black
#666771 in dark theme; #34714e, #ffffff with #655c71 outline, and #27262e in light theme.
These represent actual uniforms rather than additional brand accents. Selected swatches have
the existing accent outline and aria-pressed; labels always accompany the color.

Draft/publication state stays visible. «Начать матч» opens one sheet «Начинаем матч»: step 1 checks the
kits (tappable team chips with player counts), step 2 is the toss. With three teams it asks «Кто отдыхает
первым?», with two «Кто начинает с мячом?». The toss coin is a club token styled after the bimetal
200 tenge coin: silver ring with «FC ALTYNKA • 2026 •» spread evenly round it, gold centre with horizontal
engraving, an enamel dot in the team colour and the team name, 16 notches on the edge; no state emblem or
«QAZAQSTAN» lettering. Tapping or flicking it sends the start request; the coin rises, cycles the team
faces with light haptics, hangs until the server answers (at least ≈1.1 s) and lands on the server's
answer with a heavy haptic. Only then does the answer appear («Отдыхают Жёлтые» / «С мячом начинают
Синие»), above the blue «ИГРА 1» pair and «К игре 1». There is no re-toss; a failed start drops the coin
back with the error and keeps the request identity. Reduced motion shows the answer without flight.
The sheet is mounted above the editor, so the refetch after the start cannot close it. After kickoff, only colors remain editable; all game
labels and the Telegram roster use those current colors while numeric team identities stay fixed.
Color-only changes to saved teams do not rewrite the roster or rating snapshot. Sheets retain
their opening revision; conflicting background updates cannot silently replace that choice.

## UX audit refinements (2026-11-08)

Vocabulary: **Матч** is the whole event, **Игра N** is a short game inside it; «встреча» is not used in the
app. Event statuses come from one core map (`EVENT_STATUS_LABEL`): Идёт сбор, Матч назначен, Матч идёт,
Сбор оплаты, Матч завершён, Матч отменён. The protocol tab is «Игры»; the tasks screen is «Задачи».

Anxious moments carry their consequence before the action. «Не иду, выйти из списка» names who takes
the main-roster spot (or the lost reserve position) and offers «Остаюсь». The payment mark reads «Я перевёл»
everywhere, states that the receiver will check it against the Kaspi transfer, becomes a visible
«Перевёл? Отметь оплату» button once the person returns from Kaspi, and can be undone from its 8-second toast
(the server accepts the payer's own undo within a minute). Participation and payment failures stay inline beside the control
with «Повторить» instead of vanishing. ConfirmButton keeps its question until blur or Escape (no timer)
and announces it assertively. The final rating step shows a recap before «Отправить оценки».

Both home match cards read in one order: a quiet date line, one big answer, one 16 px line and two pill
tags, then actions. The upcoming card answers how soon («Сегодня», «Завтра», «Через 5 дней»; «Идёт игра»
while playing; the status label once the day has passed), then «время · поле» («Время уточняется» /
«Поле уточняется» when unknown); its tags are the personal one (mint «Ты в основе», warm «Ты в резерве · №n»,
neutral «Запись открыта»/«Запись закрыта») and the roster «14 / 18 · резерв 2». It carries no group tag.
A finished match from the last two days leads Home as a plum result card: date · team colour and name
(plus the group tag with several groups), the place («2 место») as the big answer, the record
«3 победы · 1 ничья · 2 поражения» (each part unbroken), tags for own goals («Без голов» at zero) and
short games, then «Оплатить», «Оценить матч» and «Таблица и бомбардиры». Its payment
and survey tasks are not repeated under «Нужно сделать». Every match row carries a personal chip
(В основе, Резерв, n/limit, or the W–D–L of a finished match). Without an explicit tab the match page
opens on «Игры» while playing and «Оплата» while billing; its back control returns to the list it was
opened from.

Pitch conditions: form fields use `--field-bg`/`--field-border` (border at least 3:1 in both themes);
on viewports 640 px tall or shorter the dock steps aside while a contextual match action is shown; the
protocol keeps «⋯» (finish match, undo last result) beside «Внести результат»; a goal slot offers
«{previous author} ещё раз». Profile links in published team cards have a 44 px hit area. `forced-colors`
gives controls system borders; list and team names hyphenate by syllable, the profile card name breaks only at spaces. The dock is the same for everyone; «Создать матч»
in the menu appears only for someone who can create a match. The skills prompt waits for the first
signup (or a visit to Profile/Players). An unrated ring shows «?» with «Нет рейтинга».
Sheets with their own route (creation, schedule, profile settings, peer profile) keep the page scroll when they open and close. Secondary ink on materials uses `--plum-ink`, `--blue-ink`, `--coral-ink`.

