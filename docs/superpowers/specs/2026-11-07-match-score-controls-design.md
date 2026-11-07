# Match score controls — approved design

The user approved the interactive preview and its final spacing on 7 November 2026, then requested implementation and release to the Telegram miniapp.

- Replace numeric score inputs with compact minus/output/plus controls. Preserve 44px buttons, stable numeric widths and a clear gap between teams: 88px on a 390px screen, adapting to narrower phones.
- Each goal has a card. Selecting it reveals only that team's players, with guest disambiguation. A player can author several goals; unknown authors remain allowed. Decreasing a score removes its last goal and that goal's attribution.
- Preserve card order, unknown positions, score and existing command identity across closing/reopening and refresh. Existing drafts remain compatible. Ambiguous submissions remain locked and retry the same payload.
- Show the latest three games, newest first. “Все матчи” opens the existing accessible ActionSheet with all results, newest first, and existing organizer edit permissions.
- Apply tabular figures throughout the match page and both sheets. Keep the current match action in the current-game card as previewed.
- Keep first-game sulifa, rotation, completion, authorization, backend payloads and database schema unchanged. Use production's optimized server baseline.

Approaches: retaining number inputs does not resolve accidental digit insertion. Per-player numeric steppers remain hard to scan. The approved approach uses score steppers and one explicit card per goal.

Builder choices: store consecutive equal goal authors as runs so restored large scores cannot allocate huge arrays; reveal long goal lists in batches. Persist this optional metadata in the existing v1 local draft while sending the same score/scorers API payload.
