import { describe, expect, it } from "vitest";
import { safeHtml, htmlSecurityIssues, PREVIEW_CSP } from "@/lib/sanitize";

describe("HTML 安全边界", () => {
  const malicious = [
    '<!doctype html><html><head>',
    '<script>window.parent.postMessage("pwned", "*")</script>',
    '<style>body{background:url(https://evil.example/a.png)} @import url(https://evil.example/b.css);</style>',
    '</head><body onload="alert(1)">',
    '<form action="https://evil.example"><input name="x" /></form>',
    '<a href="javascript:alert(1)">click</a>',
    '<img src="https://evil.example/a.png" alt="external" />',
    '<iframe src="https://evil.example"></iframe>',
    '<p>这是一段足够长的正文，用于验证安全清洗后的内容仍然保留。</p>',
    '</body></html>',
  ].join("");

  it("移除脚本、事件、表单、外链与外部 CSS", () => {
    const cleaned = safeHtml(malicious);
    expect(cleaned.toLowerCase()).not.toContain("<script");
    expect(cleaned.toLowerCase()).not.toContain("onload");
    expect(cleaned.toLowerCase()).not.toContain("<form");
    expect(cleaned.toLowerCase()).not.toContain("<input");
    expect(cleaned.toLowerCase()).not.toContain("<iframe");
    expect(cleaned.toLowerCase()).not.toContain("javascript:");
    expect(cleaned.toLowerCase()).not.toContain("https://");
    expect(cleaned.toLowerCase()).not.toContain("url(http");
    expect(cleaned).toContain("这是一段足够长的正文");
  });

  it("CSP 禁止脚本、连接、表单与嵌入", () => {
    expect(PREVIEW_CSP).toContain("script-src 'none'");
    expect(PREVIEW_CSP).toContain("connect-src 'none'");
    expect(PREVIEW_CSP).toContain("form-action 'none'");
    expect(PREVIEW_CSP).toContain("frame-src 'none'");
    expect(PREVIEW_CSP).not.toContain("allow-scripts");
  });

  it("HTML 风险扫描能报告外部资源与脚本", () => {
    const issues = htmlSecurityIssues(malicious);
    expect(issues.join(" ")).toContain("<script>");
    expect(issues.join(" ")).toContain("事件属性");
    expect(issues.join(" ")).toContain("外部网络地址");
  });
});
