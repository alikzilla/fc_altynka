# Profile sections, switches and theme

User explicitly requests direct profile editing actions under Настройка профиля, a separate Системные настройки section with notification and theme switches, and a revised identity card. No intermediate settings index. Latest steering: top row avatar on the left and name/handle/account role on the right; football info in one row underneath.

## Contracts

- Three graphite profile actions point directly to /profile/settings/name, /profile/settings/payment, /profile/settings/football. Titles: Изменить имя, Изменить оплату, Изменить футбольные данные. Settings forms return directly to /profile. Old /profile/settings and unknown-section routes recover to /profile.
- Управление remains organizer-only and contains Игроки команды. Existing initial setup persistence and football/payment validation remain intact.
- Системные настройки contains exactly two accessible role=switch controls: Уведомления, Тёмная тема. Preference status and permission recovery remain truthful. Dark switch on means dark; off means light.
- users.theme text enum dark/light NOT NULL DEFAULT dark. MeDto.theme?:AppTheme; PATCH /me accepts theme enum only. Account preference is authoritative across sessions/devices; a local cache paints the selected theme before authentication finishes.
- Core exports APP_THEMES = ['dark','light'] as const, type AppTheme. Frontend theme.ts exports getTheme():AppTheme, applyTheme(theme:AppTheme):void, initializeTheme():void. Theme changes dispatch altynka:theme. Telegram ready() syncs native colors from the explicit app theme, not Telegram's theme; no unsolicited permission prompts.
- Profile changes theme optimistically with rollback on API failure, publishes successful MeDto to shared state before background refresh, prevents duplicate saves. App hydrates accepted server theme; theme-only edits do not complete initial setup or alter notifications.
- Light theme must affect actual app surfaces, forms, dialogs, lists, navigation and focus, with readable colors; approved colored material cards remain legible. Solid page background in both modes. Existing dark design stays default.

## Ownership and steps

- [x] Root: backend/core enum + theme schema/API, migration and RED/GREEN persistence/invalid/isolation tests.
- [x] Theme task: new theme.ts/themes.css, tg.ts/main.tsx initialization/native bridge; focused tests and visual validation. Own no Profile/App/base styles.
- [x] Root: profile card revised rows, direct action sections, SystemSettings switches and App theme hydration; update relevant behavioral tests and redirect routes.
- [x] Browser checks: both theme modes and reload persistence, profile layout, direct forms/back navigation, permission decline and save failure, narrow widths + axe. Review/test the theme palette on major screens.
- [x] Independent review and material regressions; full tests/typecheck/build/detector, screenshot inspection.
- [x] Apply additive migration, deploy verified existing Worker/assets and read health/schema without synthetic Telegram sends.
