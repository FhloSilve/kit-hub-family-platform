import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const security = readFileSync("worker/security.ts", "utf8");
const entry = readFileSync("worker/entry.ts", "utf8");
const uploads = readFileSync("worker/upload-security.ts", "utf8");
const center = readFileSync("worker/security-center.ts", "utf8");

describe("Security Hardening II", () => {
  it("rate limits authentication writes without storing raw client addresses in bucket keys", () => {
    expect(entry).toContain('app.use("/api/auth/*", protectAuthRoute)');
    expect(security).toContain('crypto.subtle.digest("SHA-256"');
    expect(security).toContain('auth-sign-in');
    expect(security).toContain('auth-sign-up');
    expect(security).toContain('auth-recovery');
  });

  it("validates attachment bytes against declared content types", () => {
    expect(entry).toContain("protectAttachmentUpload");
    expect(uploads).toContain("FILE_SIGNATURE_MISMATCH");
    expect(uploads).toContain('ascii(bytes,0,5)==="%PDF-"');
    expect(uploads).toContain("0x89,0x50,0x4e,0x47");
    expect(uploads).toContain("0xff,0xd8,0xff");
  });

  it("provides an authenticated account/security export and audits it", () => {
    expect(center).toContain('/api/v1/security/account-export');
    expect(center).toContain('"account.export"');
    expect(center).toContain("Shared household content is intentionally not duplicated");
  });
});
