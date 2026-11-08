# Player profile statistics review — 8 November 2026

The user approved the iterated profile and explicitly authorized main merge and production deployment. The implemented card uses the final requested role/handle order, larger avatar, uncaptained continuous rating ring, inset position, five stats and mirrored insole silhouettes. The played-meeting date tile was removed.

## Data correctness

Statistics are derived from the current stored protocol, keyed by frozen roster userId/signupId. Every recorded game involving that team counts. Guests with null userId and unattributed goals cannot inflate account totals. Recorded/edit/undo commands retain their existing persistence; no new counters, tables, migrations or production data writes are introduced. Assist values are zero by explicit user instruction.

All eligible meetings contribute to totals and the best goals in one meeting. Only the latest twenty meeting summaries are returned. Voting deadlines do not delay statistics. Cancelled, unstarted and legacy protocols are excluded. Own history retains previous groups. Foreign history requires an active group and both active memberships. Legacy rating-history rows carry protocolVersion metadata so older protocol meetings cannot bypass the twenty-meeting sports-history window.

## Review and checks

An independent reviewer found two important issues: foreign legacy history checked only the viewer's membership, and the client could treat protocol meetings outside its history window as legacy. Both were reproduced with failing tests, fixed and verified. No important findings remained in final review; independently verified core, affected miniapp and worker statistics/API suites.

Full unit/domain/API suite: core 47, miniapp 232, worker 331, total 610 passed. Typechecks and production build passed. Full browser suite: 173 passed, two pre-existing trusted-touch exclusions skipped; no failures. Browser checks cover own/peer profiles, themes, 320/390px, rating and game sheets, accessibility and retained settings. Wrangler deploy dry-run passed with existing D1/assets/Durable Object bindings.

The existing test baseline failed on the calendar date: old fixtures scheduled 6–7 November against actual 8 November, and native Durable Object alarms clamp past deadlines to real time. Test-only fixes inject API clocks, use a dynamically future Saturday for actual alarms, and anchor compact scheduled browser fixtures to their intended pre-kickoff server time. Boundary-clock tests retain their explicit serverNow. Old profile assertions were updated for role emojis and accessible insole labels rather than the removed text fields. No production timing policy changed.

## Limits

No per-game substitutions are tracked: the frozen team roster defines participation. Guests without accounts retain their names in the original protocol; no identity is guessed from a matching name. Assists are initialized to zero, without an assist-entry workflow. Apple emoji assets are native on Apple systems, with system fallback on other platforms. Production checks use real read-only APIs and compare stored protocol state and served assets; physical Telegram-device testing is separate.
