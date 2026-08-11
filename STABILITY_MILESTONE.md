# Kit Hub UI & Stability Milestone

This milestone pauses feature expansion long enough to make the current Kit Hub experience reliable, consistent, and easier to extend.

## Exit criteria

The milestone is complete when the production app passes the normal release workflow and the following areas are verified on mobile and desktop in both light and dark appearance modes.

## Foundation now in place

- `src/design-system.css` is the shared token layer for spacing, radii, tap targets, focus, motion, status colours, dark surfaces and typography.
- `UiStabilityRuntime` centrally handles modal body scroll lock, desktop focus hand-off, Escape closing, visual viewport height and mobile keyboard inset tracking.
- `stability-pass-2.css` is the authoritative visual audit layer while older feature styles are gradually consolidated.
- `tests/ui-stability.test.ts` protects the mobile profile trigger, design tokens, 16px Safari form controls, modal runtime, Admin routes/navigation and the dark-mode module audit.
- The normal `npm test` / `npm run ci` path therefore now contains explicit UI stability guardrails.

## 1. Mobile navigation and safe areas

- [x] Profile menu reliably opens from the real React profile button.
- [x] Top-bar actions fit without the previous lower-right launcher collisions.
- [x] Bottom navigation reserves safe-area/content space.
- [x] Admin navigation respects iOS status/home-indicator safe areas.
- [x] Silvi, Quick Add, Routines, Feedback, and Settings have authoritative launcher locations.
- [x] Pull-to-refresh keeps the current view.
- [x] Mobile form controls use 16px text to prevent Safari auto-zoom.
- [x] Modal runtime tracks the visual viewport and keyboard inset.
- [ ] Manually verify keyboard opening/closing on Quick Add, Meals, Notes and Household settings on an installed iPhone PWA.

## 2. Dark-mode contrast audit

The authoritative stability layer now covers Home, Calendar, Tasks, Groceries, Meals, Family Hub, Household/Family Tools, Admin Release and Admin Feedback.

- [x] Body/card text and heading contrast tokens.
- [x] Muted labels and secondary text.
- [x] Theme-colored links/actions.
- [x] Inputs, selects, placeholders, focus rings and disabled states.
- [x] Empty states and key alerts/status cards.
- [x] Calendar day, selected, today and event states.
- [x] Task/grocery paper surfaces and controls.
- [x] Meals planner/library/suggestion/modal surfaces.
- [x] Family Tools and Admin feedback surfaces.
- [ ] Final visual QA in every non-default theme before removing older contrast overrides.

## 3. Navigation and account cleanup

- [x] Profile menu is the home for Personal Settings, Household, Routines & recurring chores, Feedback and Sign out.
- [x] Appearance is available as a fast top-bar action and inside Personal Settings.
- [x] Admin entry is visually distinct and only shown to eligible users.
- [x] Admin Release and Admin Feedback are separate routes with one shared Admin navigation bar.
- [ ] After production verification, remove now-redundant legacy launcher selectors instead of retaining hidden duplicates.

## 4. CSS/component consolidation

- [x] Shared design tokens documented in `src/design-system.css`.
- [x] One authoritative stability audit layer loaded last.
- [ ] After the current release is visually verified, fold useful rules from `stability-desktop.css` and `dark-mode-polish-v2.css` into the final layer and remove those imports.
- [ ] Continue replacing repeated feature-specific surface/button values with design tokens during normal maintenance.
- [ ] Reduce remaining `!important` rules where selector ownership is now clear.

The deliberate order here is important: visual verification comes before deleting legacy rules, so cleanup does not create a new regression while the baseline is still being established.

## 5. Regression coverage

Automated structural regression coverage now checks:

- [x] the real mobile profile button remains wired to React profile state;
- [x] the mobile profile menu remains present;
- [x] shared tokens and reduced-motion support remain present;
- [x] mobile form controls remain 16px or larger;
- [x] the modal/viewport stability runtime remains mounted on normal, demo and Admin routes;
- [x] modal body scroll lock, Escape behavior and visual viewport handling remain present;
- [x] Admin Release / Feedback navigation remains separated;
- [x] dark-mode audit selectors remain present for Calendar, Tasks, Groceries, Meals, Family Tools and Admin Feedback.

Next regression layer after production visual verification:

- interaction/browser tests for Quick Add open/close and profile actions;
- screenshot baselines for Home, Calendar, Admin Release and Admin Feedback in light/dark;
- widget persistence and appearance persistence browser tests.

## 6. Production verification matrix

Minimum manual verification targets:

- 390–430 px portrait mobile viewport;
- wider mobile/tablet viewport;
- desktop viewport;
- Light appearance;
- Dark appearance;
- at least two non-default color themes;
- installed PWA and normal browser tab where possible.

Priority verification surfaces for this release:

1. Desktop Home
2. Desktop Calendar
3. Admin Release
4. Admin Feedback
5. Tasks / Groceries / Meals / Family Hub / Household in dark mode
6. Mobile Quick Add, Meals modal, profile menu and keyboard/safe-area behavior

## After this milestone

Resume product expansion in this order:

1. Household coordination: reminders, overdue states, assignment workflows, fair routine/chore balancing.
2. Silvi: weekly household briefings, schedule conflicts, forgotten-task detection, meal/calendar coordination, and controlled multi-step proposals.
3. Communication/media polish: GIF search, attachments, notifications, polls, and richer chat behavior.

No new major feature area should be started before this milestone is green unless it is required to fix a stability or accessibility problem.
