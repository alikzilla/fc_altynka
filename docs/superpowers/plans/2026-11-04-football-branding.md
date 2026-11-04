# Football branding

Replace the header's outline icon and visible app name with a pearly football SVG and a short Russian football phrase. Preserve the club identity in the home link's accessible name and document title. Use the existing dark Airofit palette and typography. No Higgsfield image was supplied; use a local vector asset.

Choose a phrase once per document load, retaining it across route changes and focus/visibility refreshes. Store the last phrase in localStorage and exclude it on the next launch. If storage is unavailable, show a random phrase without blocking the app. Keep the full phrase readable on 320px screens.

Implementation:
1. Add browser coverage for phrase stability across navigation/focus, changes across reloads, and unavailable storage. Run before implementation to confirm failure.
2. Add the SVG asset, favicon, opening phrase selection, and header styling. Keep unrelated in-progress changes intact.
3. Build and typecheck; run miniapp tests and focused browser checks at 320, 390, 768, and 1440px. Inspect screenshots of the updated header.

Review focus: repeated random choices must not repeat the previous phrase; React StrictMode and remounted headers must not select again; a denied localStorage getter or write must not break startup; the profile avatar must keep its touch target and space.
