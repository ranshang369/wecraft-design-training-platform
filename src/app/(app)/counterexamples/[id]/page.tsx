"use client";
import Link from "next/link";
import { use, useEffect, useState } from "react";
import { api, useApi, formatDate } from "@/lib/client";
import { PageHeader, Badge, Empty } from "@/components/ui";
import { HtmlPreview } from "@/components/html-preview";

const AUTH_LABELS: Array<[string, string]> = [["canUseForGeneration","可生成"],["canUseForDisplay","可展示"],["canUseForTraining","可训练"],["canDeriveMechanism","可提炼机制"],["canUseForEvaluation","可评测"],["canShowPublicly","可公开展示"]];
export default function CounterexampleDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const query = useApi<any>("/counterexamples/" + id);
  const me = useApi<any>("/auth/me");
  const [authorization, setAuthorization] = useState<any>(null);
  const [members, setMembers] = useState<any[]>([]);
  const [reviewerIds, setReviewerIds] = useState<string[]>([]);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const roles: string[] = me.data?.roles ?? [];
  const canAuthorize = roles.some((role) => ["OWNER","DESIGN_LEAD"].includes(role));
  const canAssign = roles.some((role) => ["OWNER","DESIGN_LEAD","CONTENT_LEAD"].includes(role));
  const canApprove = roles.some((role) => ["OWNER","DESIGN_LEAD"].includes(role));
  const canEdit = roles.some((role) => ["OWNER","DESIGN_LEAD","ANNOTATOR","AI_ENGINEER"].includes(role));
  useEffect(() => {
    const data = query.data;
    if (!data || authorization) return;
    setAuthorization({ canUseForGeneration: data.authorization?.canUseForGeneration ?? false, canUseForDisplay: data.authorization?.canUseForDisplay ?? false, canUseForTraining: data.authorization?.canUseForTraining ?? false, canDeriveMechanism: data.authorization?.canDeriveMechanism ?? false, canUseForEvaluation: data.authorization?.canUseForEvaluation ?? false, canShowPublicly: data.authorization?.canShowPublicly ?? false, evidenceStatus: data.authorization?.evidenceStatus ?? "MISSING", evidenceNote: data.authorization?.evidenceNote ?? "", reason: "" });
  }, [query.data, authorization]);
  if (query.loading) return <div className="loading">加载反例…</div>;
  if (query.error) return <div className="error-box">{query.error}</div>;
  const data = query.data;
  if (!data) return <Empty>反例不存在。</Empty>;
  const version = data.versions?.[0];
  const assets = (data.assets ?? []).filter((asset: any) => asset.counterexampleVersionId === version?.id);
  const screenshot = assets.find((asset: any) => asset.kind === "SCREENSHOT_375");
  const html = assets.find((asset: any) => asset.kind === "HTML");
  function setAuth(key: string, value: any) { setAuthorization((current: any) => ({ ...current, [key]: value })); }
  async function run(action: () => Promise<unknown>, success: string) { setBusy(true); setMessage(null); try { await action(); await query.reload(); setMessage({ ok: true, text: success }); } catch (error) { setMessage({ ok: false, text: error instanceof Error ? error.message : "操作失败" }); } finally { setBusy(false); } }
  async function loadMembers() { if (!members.length) { try { setMembers(await api<any[]>("/members")); } catch (error) { setMessage({ ok: false, text: error instanceof Error ? error.message : "无法读取成员" }); } } }
  return <>
    <PageHeader title={data.counterexampleNo + " · " + data.title} description={"反例 · 当前 v" + data.currentVersion + " · 与优质案例完全分离"} action={<><Link className="btn" href="/cases">返回案例库</Link><Badge value={data.status} /></>} />
    {message ? <div className={message.ok ? "success-box" : "error-box"} style={{ marginBottom: 14 }}>{message.text}</div> : null}
    <div className="split-view"><div className="grid preview-sticky"><section className="card"><div className="card-head"><h2>375px 截图</h2></div>{screenshot ? <img className="preview-image" src={"/api/v1/files/" + screenshot.storedFileId + "/content"} alt="反例截图" /> : <Empty>缺少截图</Empty>}</section><section className="card"><div className="card-head"><h2>HTML</h2><span className="badge green">沙箱</span></div><HtmlPreview fileId={html?.storedFileId} /></section></div><div className="grid">
      <section className="card"><div className="card-head"><h2>失败信息</h2><Badge value={data.status} /></div><div className="detail-list"><div><dt>失败摘要</dt><dd>{version?.failureSummary}</dd></div><div><dt>失败标签</dt><dd>{(version?.failureLabels ?? []).join(" · ")}</dd></div><div><dt>复现步骤</dt><dd>{version?.reproductionSteps}</dd></div><div><dt>根因</dt><dd>{version?.rootCause ?? "—"}</dd></div><div><dt>修复建议</dt><dd>{version?.repairSuggestion}</dd></div><div><dt>来源说明</dt><dd>{version?.sourceNote}</dd></div></div><div className="actions" style={{ marginTop: 14 }}>{canEdit && ["DRAFT","CHANGES_REQUESTED"].includes(data.status) ? <button className="btn primary" disabled={busy} onClick={() => run(() => api("/counterexamples/" + id + "/submit", { method: "POST" }), "反例已提交评审。")}>提交评审</button> : null}{canApprove && ["IN_REVIEW","SUBMITTED"].includes(data.status) ? <button className="btn" disabled={busy} onClick={() => run(() => api("/counterexamples/" + id + "/approve", { method: "POST" }), "反例已批准。")}>批准反例</button> : null}</div></section>
      <section className="card"><div className="card-head"><div><h2>授权</h2><div className="card-sub">六项授权默认 false，修改需理由并写入审计。</div></div><Badge value={authorization?.evidenceStatus} /></div><form className="grid" onSubmit={(event) => { event.preventDefault(); void run(() => api("/counterexamples/" + id + "/authorization", { method: "PUT", body: JSON.stringify(authorization) }), "授权已更新。"); }}><div className="grid grid-2">{AUTH_LABELS.map(([key, label]) => <label className="check-row" key={key}><input type="checkbox" checked={Boolean(authorization?.[key])} disabled={!canAuthorize} onChange={(event) => setAuth(key, event.target.checked)} /><span>{label}</span></label>)}</div><div className="form-grid"><div className="field"><label>证据状态</label><select className="select" value={authorization?.evidenceStatus} disabled={!canAuthorize} onChange={(event) => setAuth("evidenceStatus", event.target.value)}><option value="MISSING">缺失</option><option value="PENDING">待核验</option><option value="VERIFIED">已核验</option><option value="REJECTED">已拒绝</option><option value="EXPIRED">已过期</option><option value="REVOKED">已撤销</option></select></div><div className="field"><label>证据说明</label><input className="input" value={authorization?.evidenceNote ?? ""} disabled={!canAuthorize} onChange={(event) => setAuth("evidenceNote", event.target.value)} /></div><div className="field full"><label>变更理由</label><input className="input" value={authorization?.reason ?? ""} disabled={!canAuthorize} onChange={(event) => setAuth("reason", event.target.value)} required={canAuthorize} /></div></div>{canAuthorize ? <button className="btn primary" disabled={busy}>保存授权</button> : <div className="notice">只读授权。</div>}</form></section>
      {canAssign ? <section className="card"><div className="card-head"><h2>分配评审</h2><span className="small muted">至少 2 名非作者</span></div><button className="btn small" onClick={loadMembers}>加载成员</button><div className="grid" style={{ marginTop: 10 }}>{members.map((member) => <label className="check-row" key={member.id}><input type="checkbox" checked={reviewerIds.includes(member.user.id)} onChange={(event) => setReviewerIds((current) => event.target.checked ? [...current, member.user.id] : current.filter((value) => value !== member.user.id))} /><span>{member.user.name} · {member.user.email}</span></label>)}</div><button className="btn primary" style={{ marginTop: 12 }} disabled={busy || reviewerIds.length < 2} onClick={() => run(() => api("/counterexamples/" + id + "/assign", { method: "POST", body: JSON.stringify({ reviewerIds }) }), "评审已分配。")}>分配评审</button></section> : null}
      <section className="card"><div className="card-head"><h2>评审记录</h2><span className="small muted">{data.reviews?.length ?? 0} 条</span></div>{data.reviews?.length ? <div className="grid">{data.reviews.map((review: any) => <div className="card" key={review.id} style={{ boxShadow: "none" }}><div className="card-head"><strong>v{review.version} · {review.recommendation}</strong><Badge value={review.status} /></div><div className="small">{review.rationale}</div></div>)}</div> : <Empty>尚无评审。</Empty>}</section>
    </div></div>
  </>;
}
