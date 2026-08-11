# Kit Hub UI & Stability Milestone

This milestone pauses feature expansion long enough to make the current Kit Hub experience reliable, consistent, and easier to extend.

## Exit criteria

The milestone is complete when the production app passes the normal release workflow and the following areas are verified on mobile and desktop in both light and dark appearance modes.

## 1. Mobile navigation and safe areas

- Profile menu reliably opens and every action works.
- Top-bar actions fit without overlap on narrow iPhone widths.
- Bottom navigation never covers page content.
- Admin navigation respects iOS status/home-indicator safe areas.
- Silvi, Quick Add, Routines, Feedback, and Settings have one authoritative launcher location each.
- Pull-to-refresh keeps the current view.
- Opening and closing forms does not leave Safari zoomed.

## 2. Dark-mode contrast audit

Audit Home, Calendar, Tasks, Groceries, Meals, Family Hub, Household, Personal Settings, Routines, Silvi, Feedback, and Admin.

- Body and card text meets readable contrast.
- Muted labels remain readable.
- Theme-colored links/actions remain readable.
- Inputs, selects, placeholders, focus rings, disabled states, badges, alerts, and empty states are visible.
- Light-only surfaces are removed or intentionally retained with dark text.

## 3. Navigation and account cleanup

- Profile menu becomes the single home for Personal Settings, Household, Household Rhythm, Feedback, and Sign out.
- Appearance stays available as a fast top-bar action and inside Personal Settings.
- Admin entry is visually distinct and only shown to eligible users.
- Duplicate/legacy mobile launchers are removed rather than hidden by later overrides where possible.

## 4. CSS/component consolidation

- Review `styles.css`, `mobile-layout-fixes.css`, `mobile-topbar-actions.css`, `profile-menu-polish.css`, `dark-mode.css`, `dark-mode-polish-v2.css`, `admin.css`, and `admin-polish-v2.css`.
- Merge duplicate selectors and remove obsolete override layers.
- Replace one-off `!important` fixes with component-level rules where practical.
- Document shared spacing, safe-area, surface, text, and action tokens.

## 5. Regression coverage

Add automated coverage for the repeatedly fragile interactions:

- profile menu opens and routes to each action;
- Quick Add opens/closes without changing the current page state;
- widget choices survive app updates;
- appearance preference persists;
- Admin mobile navigation renders all required actions;
- Silvi and Routines launch from their current authoritative controls.

## 6. Production verification matrix

Minimum manual verification targets:

- 390–430 px portrait mobile viewport;
- wider mobile/tablet viewport;
- desktop viewport;
- Light appearance;
- Dark appearance;
- at least two non-default color themes;
- installed PWA and normal browser tab where possible.

## After this milestone

Resume product expansion in this order:

1. Household coordination: reminders, overdue states, assignment workflows, fair routine/chore balancing.
2. Silvi: weekly household briefings, schedule conflicts, forgotten-task detection, meal/calendar coordination, and controlled multi-step proposals.
3. Communication/media polish: GIF search, attachments, notifications, polls, and richer chat behavior.

No new major feature area should be started before this milestone is green unless it is required to fix a stability or accessibility problem.
