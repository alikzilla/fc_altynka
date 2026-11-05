# Rating UI refinement implementation plan

> Use superpowers:executing-plans; the user's requested visual changes are the spec.

**Goal:** Compact profiles and a shared animated rating slider for onboarding/reviews.
**Spec:** `docs/superpowers/specs/2026-11-05-rating-ui-refinement.md`.
**Constraints:** Existing design and APIs, no dependencies, keyboard/touch/reduced motion.

1. [x] Profile tests: inline rating, no self-assessment, history retained. Update
   `PlayerRating.tsx`, `Profile.tsx`, `PlayerProfile.tsx` and profile CSS; verify tests.
2. [x] Slider tests: no untouched answer, keyboard/touch, directional numeric motion,
   release versus cancel. Add `RatingSlider.tsx` and shared styles. Replace radio grid
   in `SkillAssessment.tsx`; anchor Next using existing `MatchAction`. Preserve result.
3. [x] Review tests: page entry, sheet sequence, self exclusion, skip/back, final game,
   explicit immutable submission, saved draft, network retry. Add `ReviewRater.tsx`
   and integrate `MatchReview.tsx` without changing request contract.
4. [x] Browser tests: drag both ways, release advance, canceled gestures, fixed Next,
   sheet/back focus, both themes and narrow viewports. Capture fresh screenshots,
   verify animations in actual Chromium/WebKit and reduced-motion behavior.
5. [x] Full relevant tests, typecheck, build and independent code review. Record evidence
   and update DESIGN.md; leave changes local, without deploy.


## Evidence

- Initial RED: new profile/slider/sheet expectations failed before implementation.
- Unit/type checks: miniapp 152, core 31, Worker 201 = 384 tests; typecheck passes.
- Full Playwright: 124 pass, two explicit environment skips (existing WebKit touch
  injection and the new Chromium-only CDP drag). Both Chromium and WebKit cover
  the rating screens, keyboard, cancel/release, draft/retry and deadline.
- Build passes; fresh artifacts are in `artifacts/ratings/`.
- Independent read-only UI review: no confirmed material defects. All suggested
  touch/retry/deadline verification gaps were subsequently tested.
- Browser-discovered WebKit native range capture issue: reproduced on both drag
  flows, fixed by relying on native tracking, both tests pass in both engines.
- No deployment, migration, merge, push or new dependency.
