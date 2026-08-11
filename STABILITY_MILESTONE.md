# Kit Hub UI & Stability Milestone

This milestone pauses feature expansion long enough to make the current Kit Hub experience reliable, consistent, and easier to extend.

## Exit criteria

The milestone is complete when the production app passes the normal release workflow and the following areas are verified on mobile and desktop in both light and dark appearance modes.

## Foundation now in place

- `src/design-system.css` is the shared token layer for spacing, radii, tap targets, focus, motion, status colours, dark surfaces and typography.
- `UiStabilityRuntime` centrally handles modal body scroll lock, desktop focus hand-off, Escape closing, visual viewport height and mobile keyboard inset tracking.
- `stability-consolidated.css` contains the retained desktop/navigation/dark rules from retired patch layers.
- `stability-pass-2.css` is the authoritative full visual audit layer loaded last.
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
- [ ] Final visual QA in every non-default theme.

## 3. Navigation and account cleanup

- [x] Profile menu is the home for Personal Settings, Household, Household plan, Routines & recurring chores, Feedback and Sign out.
- [x] Appearance is available as a fast top-bar action and inside Personal Settings.
- [x] Silvi has one authoritative top-bar entry; the retired sidebar placeholder is suppressed.
- [x] Admin entry is visually distinct and only shown to eligible users.
- [x] Admin Release and Admin Feedback are separate routes with one shared Admin navigation bar.

## 4. CSS/component consolidation

- [x] Shared design tokens documented in `src/design-system.css`.
- [x] One authoritative stability audit layer loaded last.
- [x] Useful desktop/navigation rules consolidated into `stability-consolidated.css`.
- [x] `stability-desktop.css` is retired.
- [x] `dark-mode-polish-v2.css` is retired and removed.
- [ ] Continue replacing repeated feature-specific surface/button values with design tokens during normal maintenance.
- [ ] Reduce remaining `!important` rules where selector ownership is now clear.

The risky legacy-layer deletion is now complete. New product work should use the established token/navigation/modal infrastructure rather than adding new patch layers.

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

Next regression layer:

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

Priority verification surfaces for the next release:

1. Desktop Home top bar: Silvi is clearly labelled and no retired sidebar Silvi card is visible.
2. Profile menu: Household plan and Routines & recurring chores both open correctly.
3. Household plan: workload and seven-day timeline in light/dark, desktop/mobile.
4. Desktop Calendar.
5. Admin Release and Admin Feedback.
6. Mobile Quick Add, Meals modal and keyboard/safe-area behavior.

## Product work resumed

The shell/navigation/responsive foundation is now treated as infrastructure. Product expansion has resumed under `HOUSEHOLD_COORDINATION_MILESTONE.md` with Household plan, assignments/workload, weekly coordination and Silvi-assisted planning as the active direction.
