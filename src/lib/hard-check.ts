import { prisma } from "./db";
import { safeHtml, htmlSecurityIssues } from "./sanitize";
import type { HardCheckSeverity, HardCheckStatus } from "@prisma/client";

type Check = {
  ruleId: string;
  ruleVersion: string;
  severity: HardCheckSeverity;
  status: HardCheckStatus;
  message: string;
  evidence?: Record<string, unknown>;
};

function textContent(html: string) {
  return html.replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function parseRgb(value: string): [number, number, number] | null {
  const match = value.match(/rgba?\(([^)]+)\)/);
  if (!match) return null;
  const parts = match[1].split(",").map((v) => Number.parseFloat(v.trim()));
  if (parts.length < 3 || parts.some((v) => Number.isNaN(v))) return null;
  return [parts[0], parts[1], parts[2]];
}

function luminance([r, g, b]: [number, number, number]) {
  const convert = (channel: number) => {
    const value = channel / 255;
    return value <= 0.03928 ? value / 12.92 : Math.pow((value + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * convert(r) + 0.7152 * convert(g) + 0.0722 * convert(b);
}

function contrastRatio(a: [number, number, number], b: [number, number, number]) {
  const la = luminance(a), lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

export async function runChecks(html: string): Promise<{ checks: Check[]; ok: boolean; renderer: "playwright" | "unavailable" }> {
  const text = textContent(html);
  const issues = htmlSecurityIssues(html);
  const checks: Check[] = [];

  checks.push({
    ruleId: "HC-01",
    ruleVersion: "v1",
    severity: "BLOCK",
    status: text.length >= 40 && !/lorem ipsum|todo|待补充/i.test(text) ? "PASS" : "FAIL",
    message: text.length >= 40 && !/lorem ipsum|todo|待补充/i.test(text) ? "正文完整性通过" : "正文过短或包含占位内容",
    evidence: { textLength: text.length },
  });

  const images = [...html.matchAll(/<img\b[^>]*>/gi)].map((m) => m[0]);
  const imagesHaveAlt = images.every((tag) => /\balt\s*=\s*["'][^"']+["']/i.test(tag));
  const fixedImage = images.some((tag) => /position\s*:\s*fixed/i.test(tag));
  checks.push({
    ruleId: "HC-02",
    ruleVersion: "v1",
    severity: "WARN",
    status: fixedImage ? "FAIL" : "PASS",
    message: images.length === 0 ? "无图片，图片位置检查通过" : !imagesHaveAlt ? "图片缺少替代文本（警告）" : "图片位置通过",
    evidence: { imageCount: images.length, imagesHaveAlt, fixedImage },
  });

  checks.push({
    ruleId: "HC-03",
    ruleVersion: "v1",
    severity: "BLOCK",
    status: issues.length === 0 ? "PASS" : "FAIL",
    message: issues.length === 0 ? "安全 HTML 通过" : "安全 HTML 失败：" + issues.join("；"),
    evidence: { issues },
  });

  const sanitized = safeHtml(html);
  let renderer: "playwright" | "unavailable" = "unavailable";
  try {
    const { chromium } = await import("playwright-core");
    const browser = await chromium.launch({
      headless: true,
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined,
      args: ["--no-sandbox", "--disable-dev-shm-usage"],
    });
    try {
      const page = await browser.newPage({ viewport: { width: 375, height: 812 } });
      await page.setContent(sanitized, { waitUntil: "domcontentloaded" });
      const metrics = await page.evaluate(() => {
        const bodyStyle = getComputedStyle(document.body);
        return {
          scrollWidth: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth, document.body.offsetWidth),
          color: bodyStyle.color,
          backgroundColor: bodyStyle.backgroundColor,
          text: (document.body.innerText || "").trim().slice(0, 120),
        };
      });
      renderer = "playwright";
      const overflow = metrics.scrollWidth > 376;
      checks.push({
        ruleId: "HC-04",
        ruleVersion: "v1",
        severity: "BLOCK",
        status: overflow ? "FAIL" : "PASS",
        message: overflow ? "375px 横向溢出：" + metrics.scrollWidth + "px" : "375px 无横向溢出",
        evidence: { scrollWidth: metrics.scrollWidth, viewport: 375 },
      });
      const fg = parseRgb(metrics.color);
      const bg = parseRgb(metrics.backgroundColor) ?? [255, 255, 255];
      const ratio = fg ? contrastRatio(fg, bg) : 0;
      checks.push({
        ruleId: "HC-05",
        ruleVersion: "v1",
        severity: "BLOCK",
        status: ratio >= 4.5 ? "PASS" : "FAIL",
        message: ratio >= 4.5 ? "正文对比度 " + ratio.toFixed(2) + ":1" : "正文对比度不足：" + ratio.toFixed(2) + ":1",
        evidence: { ratio, foreground: metrics.color, background: metrics.backgroundColor },
      });
    } finally {
      await browser.close();
    }
  } catch (error) {
    checks.push({
      ruleId: "HC-04",
      ruleVersion: "v1",
      severity: "BLOCK",
      status: "ERROR",
      message: "375px 渲染器不可用，候选按 fail-closed 处理",
      evidence: { error: error instanceof Error ? error.message : String(error) },
    });
    checks.push({
      ruleId: "HC-05",
      ruleVersion: "v1",
      severity: "BLOCK",
      status: "ERROR",
      message: "对比度检查依赖 375px 渲染器，候选按 fail-closed 处理",
    });
  }

  const ok = checks.every((check) => check.status === "PASS" || check.status === "SKIPPED");
  return { checks, ok, renderer };
}

export async function executeHardCheckRun(candidateId: string, actorId: string) {
  const candidate = await prisma.candidate.findUniqueOrThrow({
    where: { id: candidateId },
    include: { versions: { orderBy: { version: "desc" }, take: 1 } },
  });
  const version = candidate.versions[0];
  if (!version) throw new Error("Candidate version missing");
  const result = await runChecks(version.html);
  const run = await prisma.$transaction(async (tx) => {
    const created = await tx.hardCheckRun.create({
      data: {
        candidateId,
        candidateVersionId: version.id,
        status: "COMPLETED",
        rulesetVersion: "v1",
        completedAt: new Date(),
        createdBy: actorId,
      },
    });
    await tx.hardCheck.createMany({
      data: result.checks.map((check) => ({
        runId: created.id,
        ruleId: check.ruleId,
        ruleVersion: check.ruleVersion,
        severity: check.severity,
        status: check.status,
        message: check.message,
        evidence: check.evidence ? JSON.parse(JSON.stringify(check.evidence)) : undefined,
      })),
    });
    await tx.candidate.update({
      where: { id: candidateId },
      data: { status: result.ok ? "READY_FOR_BLIND" : "HARD_CHECK_FAILED" },
    });
    return created;
  });
  return { run, ...result };
}

