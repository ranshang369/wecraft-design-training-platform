import { describe, expect, it } from "vitest";
import { loginThrottleTargets } from "@/lib/login-guard";

describe("登录节流键", () => {
  it("账号键归一化且不落明文邮箱", () => {
    const first = loginThrottleTargets(" Owner@Example.Test ");
    const second = loginThrottleTargets("owner@example.test");
    expect(first[0].key).toBe(second[0].key);
    expect(first[0].key).not.toContain("owner");
    expect(first[0].key).toMatch(/^account:[a-f0-9]{64}$/);
  });

  it("IP 键同样只保存哈希，并在缺失 IP 时退化为账号限流", () => {
    const withIp = loginThrottleTargets("owner@example.test", "203.0.113.10");
    const withoutIp = loginThrottleTargets("owner@example.test", null);
    expect(withIp).toHaveLength(2);
    expect(withIp[1].key).toMatch(/^ip:[a-f0-9]{64}$/);
    expect(withIp[1].key).not.toContain("203.0.113.10");
    expect(withoutIp).toHaveLength(1);
  });
});
