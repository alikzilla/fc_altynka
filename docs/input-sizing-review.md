# Input containment — 2026-11-04

User reported fields, especially date and time, exceeding app bounds. Added `TemporalInput` for match creation and scheduling; padding/border belong to a normal wrapper, while the native input stays padding-free. Bounded all form controls, labels, fieldsets and form parents to their content column, and excluded checkboxes from text-field padding. Native types, required/min constraints, values and change handlers are retained.

The existing combination of 100% width and 28 px native horizontal padding matches [WebKit bug 301648](https://bugs.webkit.org/show_bug.cgi?id=301648), confirmed for iOS rather than macOS. The app's device-specific overflow could not be reproduced on a physical iPhone here; the workaround removes that documented trigger. The browser regression verifies this constraint plus actual geometry and validation.

Cross-browser inspection also reproduced a 23 px-high group select in WebKit. Applying a native-appearance reset and the existing chevron vocabulary restores full form sizing; long group/receiver names stay within the selected field. Compact guest-level selects retain a 44 px minimum height.

Verification:

- `pnpm test:ui`: **38 passed**, fresh production build. Main suite runs Chromium; input regressions also run WebKit with mobile/touch settings and Russian locale.
- All input-bearing screens checked at **280, 320, 390 and 430 px**: creation, scheduling, profile, guests, billing/extras, teams/guest levels, player editor. Long group names, venue, text and amount values; checks compare input bounds to container content bounds, viewport and minimum usable height.
- Date/time required validation and value editing checked in both engines. Padding constraint failed before the fix. Select height regression reproduced WebKit's 23 px control and passes after the reset.
- Miniapp unit/integration suite: **59 passed**. Typecheck, build and `git diff --check` pass.
- Screenshots inspected: `artifacts/ui/input-webkit-inputs-date-320.png`, `input-webkit-inputs-time-320.png`, `input-chromium-date-320.png`.
- Mechanical detector: palette advisories only; no non-advisory findings.

Physical Telegram iOS/Android and OS-native picker overlays remain untested. Browser emulation is not evidence of a particular iPhone version. No dependencies, backend changes or deployment.
