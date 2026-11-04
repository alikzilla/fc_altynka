# Match lifecycle UX

User request: implement full-width loading skeletons, top-down creation overlay (date, group, optional comment), redirect to active matches after creation, active/past match tabs, and enforce appointment before billing. Preserve approved Airofit identity.

Approach: retain React/Wouter and current APIs; `/new` opens a native modal dialog over the previous screen. A dedicated page would lose the requested context; a multi-step wizard is unnecessary for three fields. Native dialog supplies inert background and keyboard focus containment; close restores the prior route. Escape, close, Telegram Back and backdrop dismiss except during submission. No automatic keyboard on mobile; focus title. Safe-area padding, bounded scroll, 200 ms entry, reduced motion.

Group is the real authenticated community returned by `/me`; currently only one community is bound. Show it as the selected group, never invent destinations. Creation validates real calendar date, no past date, optional comment <=200, and rejects a mismatching community ID server-side. Successful create redirects `/matches` and refreshes its list. Error stays inline and preserves fields; lock duplicate submits.

Matches defaults to Active (collecting/scheduled) sorted ascending, Past reuses descending keyset archive (billing/closed/cancelled). Tabs support keyboard and direct `?view=past` links. Retrying pagination retains rows. Reload on mutation and app return; reset pages on a new archive load to avoid mixed snapshots.

Lifecycle: collecting -> scheduled (time + duration) -> billing -> closed; collecting/scheduled may cancel. Existing games/scores remain readable. Billing is disallowed in collecting, and a new bill requires valid scheduled time/duration. Enforce in domain and UI. Billing can be edited while open, even for legacy existing bills without appointment metadata. No new restriction requiring the calendar date to have elapsed. Venue stays optional for compatibility, clearly labeled. Read-only schedule URLs explain closed/role restrictions. Teams cannot publish after closure or when roster changed. Signup deletion must belong to authenticated community.

Loading: full available content width on every screen, flex fill of available viewport (not stretching individual placeholders into meaningless giant boxes). Home/details/forms/list variants match content structure. Initial authentication, notifications and inline tasks also covered. Persistent content stays visible on background refresh. Skeletons noninteractive, hidden from accessibility tree, single status announcement, reduced motion.

Verify domain/API forbidden transitions, group/date validation, role guards; integration creation success/error/retry, active/past routing; browser keyboard modal focus/escape, narrow/short screens, safe areas, delayed loads and axe. No deployment or global tooling cleanup in this task.
