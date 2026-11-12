import { describe, expect, it } from "vitest";
import { runChecks } from "@/lib/hard-check";

describe("硬检查", () => {
  it("恶意 HTML 必定在安全项失败，且整体不可通过", async () => {
    const result = await runChecks('<!doctype html><html><head><script>alert(1)</script></head><body><p>这是一段足够长的正文，用于触发安全硬检查并确认脚本被拒绝。</p><img src="https://evil.example/a.png" /></body></html>');
    const security = result.checks.find((check) => check.ruleId === "HC-03");
    expect(security?.status).toBe("FAIL");
    expect(result.ok).toBe(false);
  }, 60000);
});
