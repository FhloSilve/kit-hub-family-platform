# Household Coordination + Silvi Milestone

The UI shell, responsive navigation, dark-mode tokens, modal behavior, and core stability rules are infrastructure. New product work should use those systems rather than introducing new navigation or one-off layout patterns.

## Product goal

Kit Hub should not merely store family information. It should help the household understand what is coming up, who owns what, where responsibilities are slipping, and what practical change would help next.

Silvi builds on that shared household picture. Silvi may notice, explain, and propose changes, but every mutation continues to require explicit approval.

## 1. Household plan

A single coordination surface combines:

- open tasks and assignments;
- upcoming Calendar events;
- planned meals and cook ownership;
- routines and recurring chores;
- personal responsibility counts;
- household workload balance;
- overdue routine pressure;
- the next seven days in chronological order.

The Household plan lives in the profile/account menu rather than adding another permanent navigation destination.

## 2. Routines and recurring responsibilities

Continue improving:

- owner/assignee clarity;
- due and overdue states;
- reminders and snoozing;
- completion history;
- assignment balance;
- fair rotation suggestions;
- links between recurring chores and relevant Calendar/Task context.

## 3. Assignment workflow

Tasks, routines, meals, and later other household responsibilities should make ownership explicit without turning household life into a competitive score.

Silvi workload signals must be framed as coordination information, not judgments about effort or contribution.

## 4. Weekly planning

The household plan and Silvi should identify:

- hard Calendar conflicts;
- tight turnarounds;
- important or forgotten work;
- overdue recurring chores;
- busy evenings without a dinner plan;
- meals without a cook;
- unusually uneven current assignment load.

## 5. Proactive Silvi insights

Silvi may proactively surface only useful, current signals. Insights must explain why they are shown and support dismiss/snooze preferences.

Priority order:

1. hard conflicts and overdue work;
2. forgotten/high-priority tasks;
3. busy-evening meal coordination;
4. assignment balance;
5. weekly household briefing;
6. lower-priority planning ideas.

## 6. Controlled actions

Silvi can prepare proposals for supported task, event, meal, and routine actions.

Every proposal:

- belongs to the signed-in user;
- expires;
- is single-use;
- describes exactly what will change;
- requires explicit approval;
- respects household permissions;
- supports cancel / request-fresh-proposal behavior.

## 7. Stability rule

New coordination/Silvi work must not add another floating launcher, sidebar card, or navigation system. Use the established top utilities, profile menu, panels, design tokens, and modal runtime.

## Current implementation

- Household plan surface: implemented.
- Workload view: implemented using task/routine ownership and recent routine completion context.
- Seven-day household timeline: implemented.
- Routines hand-off: implemented.
- Silvi hand-off: implemented.
- Weekly briefing, hard conflict detection, forgotten-task signals, workload balance, meal/calendar pressure: already present in the Silvi insight engine and now have a household coordination surface to build on.
- Explicit confirmation for Silvi actions remains required.

## Next product passes

1. Improve task/routine reassignment flows and recurring ownership rotation.
2. Add richer weekly-plan grouping by day and household member.
3. Let Silvi open directly into the relevant insight/proposal from Household plan.
4. Add completion/assignment trends without gamifying family contribution.
5. Add notification/reminder delivery for genuinely time-sensitive coordination signals.
