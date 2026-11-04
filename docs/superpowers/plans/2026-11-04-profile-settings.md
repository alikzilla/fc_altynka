# Profile setup and football details

**Goal:** Persist one-time profile setup, move subsequent edits to settings/payment, and show editable football position and dominant foot.
**Spec:** User request on 2026-11-04: initial name/payment form appears until saved; subsequent payment editing from settings; football data editable by user. Preserve established Airofit identity and Telegram identity source.
**Architecture:** Add additive user columns, expose them in GET/PATCH /api/me. Completion is explicit and persistent, not inferred from each page load or localStorage. Backfill existing nonempty Kaspi numbers. Miniapp profile becomes a summary after setup; gear opens ordinary settings routes, not another modal.

## Contracts

- MeDto adds optional profileCompleted:boolean, playingPosition:PlayingPosition|null, dominantFoot:DominantFoot|null for backward compatibility with fixtures. Server always sends these fields.
- PlayingPosition: goalkeeper, defender, midfielder, forward, universal. Labels: Вратарь, Защитник, Полузащитник, Нападающий, Универсал. One primary position proposed; user preference question pending.
- DominantFoot: right, left, both. Labels: Правая, Левая, Обе.
- Shared exports PLAYING_POSITIONS/DOMINANT_FEET tuple constants, playingPositionLabel/dominantFootLabel records, type PlayingPosition/DominantFoot from packages/core/src/profile.ts via index.ts.
- PATCH /me accepts profileCompleted:true (never resets), playingPosition enum|null, dominantFoot enum|null alongside existing allowed fields. Only explicit setup saves set completion. Notification-only or football-only saves do not complete onboarding.
- DB users.profileCompletedAt nullable integer, playingPosition nullable text enum, dominantFoot nullable text enum. Existing phone records backfilled at migration, and saving a valid phone through current bill flow also completes setup to avoid repeated number requests.
- Setup keeps optional Kaspi and existing name/phone validation; explicit save can complete without a phone, since only receivers require it. Completion persists if phone is later removed (subject to current open-bill restrictions).
- Profile entry named Настройки -> /profile/settings. Settings lists Оплата, Имя в списках, Футбольные данные. Details at /profile/settings/payment, /profile/settings/name, /profile/settings/football. Football summary and edit link are visible on profile. Existing Telegram notification section stays functional. A text entry already introduced in the shared workspace is preserved instead of overwriting it with a gear.
- Settings forms have truthful errors, draft preservation, duplicate-submit guard, native select controls and Back navigation. Unknown settings sections recover to settings list. Changes survive reload/login and never change another user or account role.

## Tasks

- [x] Backend RED tests for first setup, persistence, existing phone, no repeated form after clearing phone, football enums/null/invalid values and independent preferences. Implement schema/types/API, generate migration and legacy backfill; preserve receiver phone guard and bill delivery refresh.
- [x] Frontend RED tests for form disappearing only after successful setup, no repeat for returning players, settings payment edit/error, football edit/clear and phone/profile drafts. Implement summary, settings screens and gear; preserve notifications.
- [x] Add real-browser scenarios for reload, navigation, saving football data, payment-settings constraints, responsive 280/320/390px and axe. Update earlier profile-input tests to enter the correct screen.
- [x] Independent review of persistence/validation/accessibility; fix material findings with tests.
- [x] Full tests, typecheck/build, browser tests, mechanical design detector and rendered screenshot inspection.
- [x] Apply additive migration and publish verified app/Worker to the existing fc-altynka deployment; read health/schema without synthetic Telegram messages. Record version and validation.

## Scope and review focus

No mandatory football defaults, no invented player info, no extra statistics. Phone is not the sole long-term completion flag. Existing owners with open bills cannot remove Kaspi. Failed saves keep the form and entered values. Explicit null clears a football choice; missing values leave it unchanged. No local-only persistence or changes to organizer/admin permissions.

Completed: 309 unit/integration tests, 46 browser scenarios, typecheck/build/diff check passed. Independent review stale-context issue reproduced RED and fixed via immediate shared MeDto replacement with request revision guard; delayed-refresh browser regression GREEN. Additive migration applied; Worker 6b221ce9-9d90-4ff6-95f2-56933c4979ed published.
