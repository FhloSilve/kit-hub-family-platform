import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

describe("UI stability guardrails", () => {
  it("keeps the real mobile profile button wired to React state", () => {
    const source = read("src/components/TodayDashboard.tsx");
    expect(source).toContain('className="profile-button" onClick={()=>setProfile(value=>!value)}');
    expect(source).toContain('profile&&<div className="profile-popover mobile-account-menu"');
  });

  it("keeps shared design tokens and reduced motion support", () => {
    const css = read("src/design-system.css");
    expect(css).toContain("--kh-tap-min:44px");
    expect(css).toContain(':root[data-kit-appearance="dark"]');
    expect(css).toContain("prefers-reduced-motion:reduce");
  });

  it("prevents Safari input auto zoom on mobile", () => {
    const css = `${read("src/design-system.css")}\n${read("src/stability-pass-2.css")}`;
    expect(css).toMatch(/@media\(max-width:760px\)[\s\S]*input,select,textarea\{font-size:16px/);
  });

  it("keeps the modal runtime mounted across app routes", () => {
    const app = read("src/App.tsx");
    const runtimeUses = app.match(/<UiStabilityRuntime\/>/g) ?? [];
    expect(runtimeUses.length).toBeGreaterThanOrEqual(3);
  });

  it("keeps modal scroll lock and viewport keyboard handling", () => {
    const runtime = read("src/components/UiStabilityRuntime.tsx");
    expect(runtime).toContain("document.body.style.overflow = 'hidden'");
    expect(runtime).toContain("window.visualViewport");
    expect(runtime).toContain("--kh-keyboard-inset");
    expect(runtime).toContain("event.key !== 'Escape'");
  });

  it("keeps the Admin navigation and separated feedback route", () => {
    const appearance = read("src/components/AppearanceControl.tsx");
    const app = read("src/App.tsx");
    expect(appearance).toContain('window.location.href="/admin/feedback"');
    expect(appearance).toContain('window.location.href="/admin"');
    expect(app).toContain('window.location.pathname.startsWith("/admin/feedback")');
  });

  it("keeps the dark mode module audit in the authoritative last layer", () => {
    const css = read("src/stability-pass-2.css");
    for (const selector of [".calendar-v2-day", ".task-row", ".grocery-paper", ".meal-week-card", ".family-tools", ".admin-feedback-board"]) {
      expect(css).toContain(selector);
    }
  });
});
