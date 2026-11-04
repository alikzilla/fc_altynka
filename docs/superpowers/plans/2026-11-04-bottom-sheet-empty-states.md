# Bottom sheet and quiet empty states

User correction authorizes implementation: creation rises from the bottom and dismisses by downward swipe. Empty states should feel like ordinary product content. Preserve approved Airofit palette, forms, server workflows and route-backed modal.

Approach: native dialog retains focus, inert background and Back support. Bottom-anchored rounded upper edge, safe-area footer and visible grabber. Pointer-driven vertical movement from header/handle; downward touch from content at scroll-top may dismiss, while upward content gestures scroll normally. Interactive controls never start dragging. Distance/velocity threshold dismisses; short, horizontal, cancelled gestures spring back. Keep one pointer owner; release capture on cancel/lost capture/blur, and ignore gestures during submission. Escape, close, backdrop remain available. Motion disabled with reduced-motion. No gesture dependency.

Empty states: remove decorative icon tiles, centre alignment and oversized headings. Use left-aligned concise text and one action where the user can change the outcome. Group the action with its explanation. Suppress empty Home tasks instead of stacking repeated nothing-to-do messages. No fake sample matches or placeholder content.

Research: https://atlassian.design/components/empty-state/usage/ ; https://stackoverflow.design/system/components/empty-states ; https://developer.android.com/develop/ui/compose/components/bottom-sheets ; https://github.com/material-components/material-components-android/blob/master/docs/components/BottomSheet.md

- [x] Add regressions for downward dismiss, short/cancelled/multi-pointer drag, content scrolling and submission lock; run before implementation.
- [x] Implement bottom sheet drag/animation and simplify empty states, preserve existing role/action constraints.
- [x] Run unit/type/build checks and production browser tests at narrow/short/desktop sizes. Inspect screenshots of each empty surface and open/dragging sheet, axe and reduced motion.
- [x] Independent review and fix meaningful findings; document actual evidence and device limitations.

Completion: see `docs/bottom-sheet-review.md`. 203 unit/integration tests and 28 production browser scenarios pass, typecheck/build/diff checks pass, independent review finding fixed with a failing-then-passing regression.
