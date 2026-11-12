"use client";
import Link from "next/link";
import { use, useState } from "react";
import { api, useApi, formatDate } from "@/lib/client";
import { PageHeader, Badge, Empty } from "@/components/ui";
import { HtmlPreview } from "@/components/html-preview";

export default function CandidateDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const query = useApi<any>("/candidates/" + id);
  const me = useApi<any>("/auth/me");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const canCheck = (me.data?.roles ?? []).includes("AI_ENGINEER");
  if (query.loading) return <div className="loading">加载候选…</div>;
  if (query.error) return <div className="error-box">{query.error}</div>;
  const candidate = query.data;
  if (!candidate) return <Empty>候选不存在。</Empty>;
  const version = candidate.versions?.[0];
  const versionAssets = (candidate.assets ?? []).filter((asset: any) => asset.candidateVersionId === version?.id);
  const screenshot = versionAssets.find((asset: any) => asset.kind === "SCREENSHOT_375");
  const html = versionAssets.find((asset: any) => asset.kind === "HTML");
  const run = candidate.hardCheckRuns?.[0];
  async function execute(path: string) {
    setBusy(true); setMessage(null);
    try { const result: any = await api(path, { method: "POST" }); await query.reload(); setMessage({ ok: result.ok ?? true, text: result.ok ? "硬检查完成并通过。" : "硬检查完成，存在阻断项。" }); }
    catch (error) { setMessage({ ok: false, text: error instanceof Error ? error.message : "执行失败" }); }
    finally { setBusy(false); }
  }
  return <>
    <PageHeader title={candidate.candidateNo + " · " + candidate.title} description={"候选版本 v" + candidate.currentVersion + " · 创建于 " + formatDate(candidate.createdAt)} action={<><Link className="btn" href="/candidates">返回候选</Link><Badge value={candidate.status} /></>} />
    {message ? <div className={message.ok ? "success-box" : "error-box"} style={{ marginBottom: 14 }}>{message.text}</div> : null}
    <div className="split-view">
      <div className="grid preview-sticky"><section className="card"><div className="card-head"><h2>375px 截图</h2></div>{screenshot ? <img className="preview-image" src={"/api/v1/files/" + screenshot.storedFileId + "/content"} alt="候选 375px 截图" /> : <Empty>缺少截图</Empty>}</section><section className="card"><div className="card-head"><h2>HTML</h2><span className="badge green">沙箱</span></div><HtmlPreview fileId={html?.storedFileId} /></section></div>
      <div className="grid">
        <section className="card"><div className="card-head"><h2>元数据</h2><Badge value={candidate.status} /></div><div className="detail-list"><div><dt>Brief</dt><dd className="mono">{candidate.briefId}</dd></div><div><dt>模型供应商</dt><dd>{version?.modelProvider ?? "仅管理角色可见"}</dd></div><div><dt>模型名称</dt><dd>{version?.modelName ?? "—"}</dd></div><div><dt>模型版本</dt><dd>{version?.modelVersion ?? "—"}</dd></div><div><dt>内容 hash</dt><dd className="mono small">{version?.contentHash?.slice(0, 24)}…</dd></div></div></section>
        <section className="card"><div className="card-head"><div><h2>五项硬检查</h2><div className="card-sub">正文完整性、图片位置、安全 HTML、375px 溢出、对比度。渲染器不可用时 fail-closed。</div></div><Badge value={run ? (candidate.status === "HARD_CHECK_FAILED" ? "FAILED" : "COMPLETED") : "PENDING"} /></div>{run?.checks?.length ? <div className="grid">{run.checks.map((check: any) => <div className="check-row" key={check.id}><Badge value={check.status} /><span style={{ flex: 1 }}><strong>{check.ruleId}</strong> · {check.message}</span><span className="small muted">{check.severity}</span></div>)}</div> : <Empty>尚未运行硬检查</Empty>}{canCheck ? <div className="actions" style={{ marginTop: 14 }}><button className="btn" disabled={busy} onClick={() => execute("/candidates/" + id + "/hard-check")}>运行硬检查</button><button className="btn primary" disabled={busy} onClick={() => execute("/candidates/" + id + "/submit")}>重新检查并更新状态</button></div> : null}</section>
        {run?.completedAt ? <div className="small muted">最近运行：{formatDate(run.completedAt)} · 规则集 {run.rulesetVersion}</div> : null}
      </div>
    </div>
  </>;
}
