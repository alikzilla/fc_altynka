# Profile setup and football settings

User requested one-time name/payment setup, subsequent payment editing in settings, and editable playing position/dominant foot. Implemented on the existing profile and API with no extra dependency.

## Behavior and storage

- Initial name/Kaspi form disappears after an accepted save. A nullable completion timestamp in D1 persists this across reloads and devices. Phone remains optional for regular players; existing receiver restrictions still apply.
- Existing saved nonempty Kaspi numbers are backfilled as completed. Clearing the phone later does not reopen setup. An additional guard covers legacy records updated in the migration/deploy window. Saving a receiver phone from the bill editor also records completion.
- Profile settings contain payment number, club display name and football details. Telegram identity remains sourced from signed Telegram data.
- Primary position: goalkeeper, defender, midfielder, forward, universal. Dominant foot: right, left, both. Values are optional, use native selectors, and explicit null clears them. No default position/foot is assigned.
- GET/PATCH /api/me returns actual persisted fields and validates allowed enum values. Fields affect only the authenticated user's profile and never account roles. Notification-only and football-only saves do not complete an otherwise empty profile.
- Forms keep drafts after errors; submitted fields are locked while saving. Profile remains the active navigation destination inside settings.

## Verification

- Backend tests cover durable completion, optional phone, legacy phone clearing, enum validation, null/partial updates, rejected atomic edits, own-user scope, and receiver-phone setup.
- Frontend tests cover initial/returning states, accepted/failed setup, notification draft isolation, payment guard/errors, name collisions, football save/clear, route recovery and duplicate-submit prevention.
- Browser paths cover setup/save/reload/settings/payment/football at 280, 320 and 390 px with axe; existing input checks cover native WebKit selectors through 430 px.
- Final full run: 24 core + 109 miniapp + 176 worker tests; 46 browser scenarios; typecheck, production build and diff check passed.
- Independent review found stale context could seed an empty payment form immediately after a successful setup save. Reproduced with delayed GET /me. Successful PATCH responses now update shared MeContext immediately; resource revisions prevent older GET responses from overwriting them. The added hook and browser regression pass; miniapp total is 109 tests and profile browser total is 5.
- Impeccable detector: 103 palette advisories over the shared preexisting stylesheet, no non-advisory findings. Profile and football settings screenshots inspected.

Deployment uses additive migration 0006_living_big_bertha.sql. No real profile football data is filled automatically; existing user names, phones, subscriptions and match data are preserved.

Migration applied and Worker/Mini App published as version `6b221ce9-9d90-4ff6-95f2-56933c4979ed` on 2026-11-04. The existing text settings entry in the shared workspace was preserved; profile routes retain the named Настройки link.

## Profile card revision — 2026-11-05

Replaced the standalone settings link with a graphite action under Management, matching the organizer Players action. All members see settings; only authorized organizers see Players. Telegram identity and football fields now occupy one plum card with avatar left and remaining data right. Existing setup, settings routes, persistence and notification controls remain functional.

Verified 109 miniapp tests, 23 relevant browser scenarios, typecheck/build/diff check; inspected organizer 390px and long-name player 280px screenshots. Browser geometry verifies the avatar remains left of the name, with no horizontal overflow; axe checks cover both roles. Detector reports palette advisories only in the shared stylesheet.

Published as Worker version `e17d6e29-80d9-47d4-8f8c-9aef2f1d04a0`; this visual revision needs no database migration.

## Direct actions, system switches and revised card — 2026-11-05

The latest user correction supersedes the earlier card/menu arrangement. Identity text is now left and the avatar right in the top row; position and dominant foot share one row underneath a divider. Настройка профиля exposes the three edit actions directly. Each form returns to Profile; the old intermediate index redirects there. Системные настройки contains notification and dark-theme switches. Organizer player management remains a separate Управление section.

Theme is persisted per account as dark/light, with dark as the migration default and a local first-paint cache. Light mode covers forms, lists, dialogs, navigation, skeletons and controls; saturated material cards retain readable light text. Telegram native colours follow the explicit account theme. Theme changes neither complete setup nor alter notification consent. Migration 0007_grey_boomerang.sql adds only the theme column.

Independent review found two response-order bugs. Both were reproduced failing in real-App browser scenarios before fixes: a delayed notification response could overwrite newly saved payment setup; an old failed theme request could roll back a later successful choice after navigation. Field-scoped functional shared-state updates now preserve independent profile changes, and theme-operation ownership survives route unmounts. Both regressions and a functional resource-update regression pass.

Final checks: 24 core + 118 miniapp + 181 worker tests passed (323 total); all 54 browser scenarios passed, including WebKit input checks. Typecheck, production build, Worker dry run and diff check passed. Additional light-theme matrix covered 15 screens at 320/390 px with axe, overflow and select-chevron checks (30 combinations). Inspected both profile themes at 390 px and long-name profile at 280 px. Mechanical detector reported 174 palette advisories across shared dark/light styles and zero primary findings.

Migration 0007 applied and Worker/assets published as `43b70d9e-2f75-428a-8e1d-1545302192c1`. Remote schema confirms theme TEXT NOT NULL DEFAULT 'dark'; health returns HTTP 200/ok and Telegram has zero pending updates. No Telegram messages were sent for verification.

All 13 profile browser scenarios also passed against the published assets, using intercepted API fixtures so production user data was not modified.

Latest correction: photo is now on the left and identity text on the right; the football row remains underneath. Four player/organizer geometry and axe scenarios at 280/390 px passed, along with the production build, miniapp typecheck and diff check. Screenshot inspected. Published as `6c791a35-3a02-4728-ab62-c24b924b6661`.
