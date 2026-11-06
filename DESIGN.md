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

Apple system stack with bundled Onest Variable fallback, optical sizing enabled. Screen titles 28 px / 600, 27 px below 360 px; section headings 18 px / 550; body 16 px; metadata 12–14 px. Navigation labels are 11 px. The main calendar day is 62 px / 450, 57 px on narrow phones, accompanied by the month at 24/22 px. Dates, amounts and roster counts use tabular figures.

One centred column caps at 440 px, with 20 px gutters and 16 px below 360 px. Content groups use 20 px gaps. Cards use approximately 30 px corners; the featured match uses 37 px and 21 px padding. Device and Telegram safe areas are included. At least 148 px plus bottom inset is reserved for the fixed dock.

## Navigation and screens

Nested screens support Back with an inward horizontal swipe starting within 24 px of either canvas edge. The gesture shares the Telegram Back action; it never uses external browser history. A small arrow follows the pull and changes tone at the commit threshold. Root tabs stay in place. Vertical scrolling, carousels, tabs, inputs, cancellation and multitouch retain their own behavior. An open creation sheet owns Back and blocks it while saving. Reduced motion uses a stationary arrow.

Screens start directly with the page title at the standard safe-area inset. There is no separate club header, rotating football greeting, logo or avatar above it. Profile editing actions appear directly below its summary; the profile title has no decorative icon or action on its right.

Organizer/admin destinations: Главная, Матчи, central ＋, Задачи, Профиль. Players have four destinations. Creation and role/name management are role-gated. The player directory and sports profiles are available to every community member. The dock caps at 416 px, sits 16 px above the safe bottom, has 32 px corners and an opaque blue material. The central pearl control is 52 px. Selection lights the icon; there is no moving lens. A small dot identifies real pending tasks and is hidden if task refresh fails.

Home leads with active collecting/scheduled matches, sorted by date/id. Native scroll snap, keyboard-accessible links and explicit previous/next controls operate the carousel. A single match uses the full available width. Open bills do not replace signup cards. Personal tasks follow, then next games or the latest billed/closed/cancelled match.

Matches has Active and Past tabs with URL state and keyboard support. Active shows collecting/scheduled matches in ascending date order. Past groups billing/closed/cancelled matches by month and loads 20 at a time with retry that retains previous pages. Refresh invalidates older pages and discards stale pagination responses. Task cards link to the existing bill or scheduling route; successful mutations and app return refresh obligations and match lists. Payment detail also refreshes on return from an external app.

Creation opens a native bottom sheet over the current screen; the background tab/query and scroll context are retained. It uses the same opaque graphite material, 32 px top corners, safe-area footer and a 240 ms upward entry with a faster downward exit. A visible grabber and the header support touch/mouse dragging. Pulling down from unoccupied content at scroll-top also dismisses; upward/ongoing scrolling and form controls retain native behavior. Short, horizontal, cancelled and multi-pointer gestures reset cleanly. A gesture starting inside cannot become a backdrop click. Viewport resize adjusts keyboard clearance. Telegram vertical minimize swipes are temporarily suspended on supported clients and restored on cleanup. The title receives focus without opening a mobile keyboard. Tab stays inside; Escape, backdrop, close and Telegram Back dismiss it. During submission controls are locked. Date, authenticated Telegram group and optional comment fit one step; failures preserve input. Success closes the sheet and opens Active matches. Browser Back may leave a pending request; its late response must not navigate the person away from their new screen.

Match details lead with day/month and weekday, followed by one plum card: prominent time, venue, roster count, short match status and personal participation. Participation remains visible on Участники, Составы and Оплата; the existing list/teams/bill query values remain compatible. There is no permanent step indicator. The organizer note sits before the roster. Main and reserve lists remain separate; a reservist sees their queue position. Изменить opens an explicit exit action; organizer cancellation stays in a separate confirmed menu, and player management opens from each row's contextual menu.

One contextual primary action is fixed 12 px above the navigation dock: join/reserve, schedule, split/publish teams, or open/submit the bill form. Scheduling takes priority for an organizer while collecting; their own signup remains available in the card. Content has extra bottom clearance when this action exists. Native action sheets own Back, trap focus, restore the trigger, and block dismissal during a pending mutation. Kaspi is the exception: its transfer button stays inside the coral payment card. The card leads the bill tab and always reserves a status line (К оплате, Доплатить or Ты отметил оплату), so marking payment does not move the amount and recipient. Amounts can be copied through the adjacent copy affordance. Closed bills expose no new transfer/mark actions, and receivers have no personal obligation card. Expenses and payer lines follow. A payment mark is the member's declaration, not bank verification; correcting paid lines retains existing receiver/organizer permissions.

Time and duration are required before a new bill can be issued, enforced server-side and explained with an appointment action in the bill tab. Venue is optional. Scheduling is read-only after billing/cancellation/closure. Bill creation and editing open in a native bottom sheet over the unchanged Payment tab. The form scrolls independently, and its submit footer remains at the bottom of the sheet, above keyboard/safe-area clearance. Pending submission locks dismissal; closing restores trigger focus. Drafts preserve amounts on refresh and only submit currently present selected signups. Closed matches and legacy bills remain readable. Team publication rejects a stale roster or closed match. Published teams identify the member's own team. Player names open sports profiles; public decimal ratings replace the previous hidden levels. Saved teams retain a rating snapshot.

Transient notifications appear at the safe top inset throughout the app, above content and clear of the fixed action and bottom navigation. The persistent Задачи destination remains in the dock.

Profile displays verified Telegram photo, full name and username. Missing or broken photos use initials. Editable club display name and Kaspi phone remain separate. Authorized users reach player management from profile.

## Accessibility and states

Real links/buttons, one h1, named regions, visible focus, keyboard tabs, readable error/empty/loading states. All content can scroll clear of the dock. Reduced motion disables animation/travel. Increased contrast flattens materials and adds clear edges. Materials are already opaque, so reduced-transparency preferences do not depend on browser blur support.

Skeleton containers span the full content width without nested gutters. Screen frames occupy the viewport; list placeholders fill the available content column, while home has a featured-card silhouette and independent task placeholders. Skeleton surfaces use #201e27 and inner bars #35313f; step indicators use #26232e/#40334f. Individual bars may be shorter to represent text. Skeleton graphics are hidden from assistive technology; a single status describes each loading resource. Existing content stays visible while refreshing.

Form controls and their flex/grid parents have a zero minimum width and are bounded to their content column. `TemporalInput` places the 50 px frame, border and padding on a wrapper around a native date/time input; the native control has no padding, avoiding iOS WebKit's percentage-width sizing bug. Focus is drawn around the whole frame. Native value editing and validation remain available. Selects use a consistent chevron and appearance reset, preserving the 50 px form height (44 px for compact guest levels) on WebKit; long selected values truncate within the control. Checkbox controls do not inherit text-field padding.

The profile shows Telegram identity and a compact football summary (primary playing position and dominant foot). Name/Kaspi setup appears until the first accepted save; completion lives on the server and remains complete after a phone is removed. Returning users edit their number through the direct payment action, alongside name and football actions. Football values stay unspecified until chosen and can be cleared. Native selectors retain the shared form sizing; submitted setup fields are disabled while saving, and failed saves retain drafts. Profile navigation stays active throughout its settings routes; forms return directly to Profile.

Profile identity and football details share one plum card. Its upper row places the avatar on the left, with name, Telegram handle and account role on the right. A divider separates the football information below: position and dominant foot share one two-column row, including on narrow phones. Настройка профиля contains three direct graphite actions: Изменить имя, Изменить оплату, Изменить футбольные данные. They use the same icon/copy/chevron format as organizer controls. Системные настройки contains two accessible switches, Уведомления and Тёмная тема. Notification permission recovery stays adjacent to its switch when necessary. Игроки команды is available to everyone: under Управление for organizers/admins and Команда for players. Role and club-name controls appear only for admins, separately from sports profiles.

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
