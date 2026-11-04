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

Organizer/admin destinations: Главная, Матчи, central ＋, Задачи, Профиль. Players have four destinations. Creation and player management are role-gated. The dock caps at 416 px, sits 16 px above the safe bottom, has 32 px corners and an opaque blue material. The central pearl control is 52 px. Selection lights the icon; there is no moving lens. A small dot identifies real pending tasks and is hidden if task refresh fails.

Home leads with active collecting/scheduled matches, sorted by date/id. Native scroll snap, keyboard-accessible links and explicit previous/next controls operate the carousel. A single match uses the full available width. Open bills do not replace signup cards. Personal tasks follow, then next games or the latest billed/closed/cancelled match.

Matches has Active and Past tabs with URL state and keyboard support. Active shows collecting/scheduled matches in ascending date order. Past groups billing/closed/cancelled matches by month and loads 20 at a time with retry that retains previous pages. Refresh invalidates older pages and discards stale pagination responses. Task cards link to the existing bill or scheduling route; successful mutations and app return refresh obligations and match lists. Payment detail also refreshes on return from an external app.

Creation opens a native bottom sheet over the current screen; the background tab/query and scroll context are retained. It uses the same opaque graphite material, 32 px top corners, safe-area footer and a 240 ms upward entry with a faster downward exit. A visible grabber and the header support touch/mouse dragging. Pulling down from unoccupied content at scroll-top also dismisses; upward/ongoing scrolling and form controls retain native behavior. Short, horizontal, cancelled and multi-pointer gestures reset cleanly. A gesture starting inside cannot become a backdrop click. Viewport resize adjusts keyboard clearance. Telegram vertical minimize swipes are temporarily suspended on supported clients and restored on cleanup. The title receives focus without opening a mobile keyboard. Tab stays inside; Escape, backdrop, close and Telegram Back dismiss it. During submission controls are locked. Date, authenticated Telegram group and optional comment fit one step; failures preserve input. Success closes the sheet and opens Active matches. Browser Back may leave a pending request; its late response must not navigate the person away from their new screen.

Match details show four steps: collecting, scheduled, billing, closed. Time and duration are required before a new bill can be issued, enforced server-side and explained with an appointment link in the bill tab. Venue is optional. Scheduling is read-only after billing/cancellation/closure. Bill drafts preserve amounts on refresh and only submit currently present selected signups. Closed matches and legacy bills remain readable. Team publication rejects a stale roster or closed match.

Profile displays verified Telegram photo, full name and username. Missing or broken photos use initials. Editable club display name and Kaspi phone remain separate. Authorized users reach player management from profile.

## Accessibility and states

Real links/buttons, one h1, named regions, visible focus, keyboard tabs, readable error/empty/loading states. All content can scroll clear of the dock. Reduced motion disables animation/travel. Increased contrast flattens materials and adds clear edges. Materials are already opaque, so reduced-transparency preferences do not depend on browser blur support.

Skeleton containers span the full content width without nested gutters. Screen frames occupy the viewport; list placeholders fill the available content column, while home has a featured-card silhouette and independent task placeholders. Skeleton surfaces use #201e27 and inner bars #35313f; step indicators use #26232e/#40334f. Individual bars may be shorter to represent text. Skeleton graphics are hidden from assistive technology; a single status describes each loading resource. Existing content stays visible while refreshing.

Form controls and their flex/grid parents have a zero minimum width and are bounded to their content column. `TemporalInput` places the 50 px frame, border and padding on a wrapper around a native date/time input; the native control has no padding, avoiding iOS WebKit's percentage-width sizing bug. Focus is drawn around the whole frame. Native value editing and validation remain available. Selects use a consistent chevron and appearance reset, preserving the 50 px form height (44 px for compact guest levels) on WebKit; long selected values truncate within the control. Checkbox controls do not inherit text-field padding.

The profile shows Telegram identity and a compact football summary (primary playing position and dominant foot). Name/Kaspi setup appears until the first accepted save; completion lives on the server and remains complete after a phone is removed. Returning users edit their number through the direct payment action, alongside name and football actions. Football values stay unspecified until chosen and can be cleared. Native selectors retain the shared form sizing; submitted setup fields are disabled while saving, and failed saves retain drafts. Profile navigation stays active throughout its settings routes; forms return directly to Profile.

Profile identity and football details share one plum card. Its upper row places the avatar on the left, with name, Telegram handle and account role on the right. A divider separates the football information below: position and dominant foot share one two-column row, including on narrow phones. Настройка профиля contains three direct graphite actions: Изменить имя, Изменить оплату, Изменить футбольные данные. They use the same icon/copy/chevron format as organizer controls. Системные настройки contains two accessible switches, Уведомления and Тёмная тема. Notification permission recovery stays adjacent to its switch when necessary. Управление appears only for organizers/admins and contains Игроки команды.

Synthetic images and data appear only in visual artifacts and tests. Real API data is authenticated with signed Telegram initData and scoped to the current group/user. Physical-device Telegram validation is separate from browser tests.

## Empty content

Empty states stay in the content flow: left-aligned 17 px heading, short 14 px explanation, optional contextual action with natural width. No decorative icon tile or large centre-aligned poster. Keep the layout and tabs intact; distinguish things the person can create from things they must wait for. Home omits its tasks section when no tasks remain. Empty archive/notifications/teams/player lists use the same quiet treatment. No fabricated matches or sample content.
