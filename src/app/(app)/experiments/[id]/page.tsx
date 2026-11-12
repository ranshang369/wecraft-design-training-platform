"use client";
import Link from "next/link";
import { use, useState } from "react";
import { api, useApi, formatDate } from "@/lib/client";
import { PageHeader, Badge, Empty } from "@/components/ui";

export default function ExperimentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const query = useApi<any>("/experiments/" + id);
  const me = useApi<any>("/auth/me");
  const [results, setResults] = useState<any>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const manager = (me.data?.roles ?? []).some((role: string) => ["OWNER", "ADMIN", "DESIGN_LEAD", "AI_ENGINEER"].includes(role));
  if (query.loading) return <div className="loading">加载实验…</div>;
  if (query.error) return <div className="error-box">{query.error}</div>;
  const experiment = query.data;
  if (!experiment) return <Empty>实验不存在。</Empty>;
  const candidates = experiment.candidates ?? [];
  const pairs = experiment.pairs ?? [];
  async function action(path: string, success: string) {
    setBusy(true); setMessage(null);
    try { await api(path, { method: "POST", body: path.endsWith("/close") ? JSON.stringify({}) : undefined }); await query.reload(); setMessage({ ok: true, text: success }); }
    catch (error) { setMessage({ ok: false, text: error instanceof Error ? error.message : "操作失败" }); }
    finally { setBusy(false); }
  }
  async function loadResults() {
    try { setResults(await api("/experiments/" + id + "/results")); }
    catch (error) { setMessage({ ok: false, text: error instanceof Error ? error.message : "无法读取结果" }); }
  }
  return <>
    <PageHeader title={experiment.experimentNo + " · " + experiment.name} description={"评分表 " + experiment.rubricVersion + " · 启动于 " + formatDate(experiment.startsAt) + " · 盲测期间模型与来源隐藏"} action={<><Link className="btn" href="/experiments">返回实验</Link><Link className="btn" href={"/experiments/" + id + "/blind"}>盲测房间</Link>{manager && experiment.status === "RUNNING" ? <button className="btn primary" disabled={busy} onClick={() => action("/experiments/" + id + "/close", "实验已关闭。")}>关闭实验</button> : null}<Badge value={experiment.status} /></>} />
    {message ? <div className={message.ok ? "success-box" : "error-box"} style={{ marginBottom: 14 }}>{message.text}</div> : null}
    <div className="grid grid-3" style={{ marginBottom: 16 }}>
      <div className="card"><div className="stat-label">Pair 数</div><div className="stat-value">{pairs.length}</div></div>
      <div className="card"><div className="stat-label">已完成 Pair</div><div className="stat-value">{pairs.filter((pair: any) => pair.status === "COMPLETED").length}</div></div>
      <div className="card"><div className="stat-label">候选</div><div className="stat-value">{manager ? candidates.length : "隐藏"}</div></div>
    </div>
    <div className="grid grid-2">
      <section className="card"><div className="card-head"><h2>实验协议</h2><Badge value={experiment.status} /></div><div className="detail-list"><div><dt>双评审</dt><dd>{experiment.protocol?.reviewers ?? 2} 人独立提交</dd></div><div><dt>裁决</dt><dd>{experiment.protocol?.adjudicator ?? 1} 人确认</dd></div><div><dt>隐藏项</dt><dd>模型 / 来源 / 上一轮分数</dd></div><div><dt>运行窗口</dt><dd>{formatDate(experiment.startsAt)} → {formatDate(experiment.closesAt)}</dd></div><div><dt>冻结时间</dt><dd>{formatDate(experiment.frozenAt)}</dd></div></div></section>
      <section className="card"><div className="card-head"><h2>Brief</h2></div>{experiment.briefs?.length ? experiment.briefs.map((entry: any) => <div className="check-row" key={entry.briefId}><span className="mono">{entry.brief?.briefNo}</span><span style={{ flex: 1 }}>{entry.brief?.title}</span>{entry.brief?.split === "HOLDOUT" ? <Badge value="HOLDOUT" /> : null}</div>) : <Empty>未绑定 Brief</Empty>}</section>
    </div>
    <section className="card" style={{ marginTop: 16 }}><div className="card-head"><div><h2>Pair 状态</h2><div className="card-sub">两名评审提交后进入待裁决；裁决确认后 pair 才 COMPLETED。</div></div></div><div className="table-wrap"><table><thead><tr><th>Pair</th><th>状态</th><th>裁决结果</th><th>操作</th></tr></thead><tbody>{pairs.map((pair: any) => <tr key={pair.id}><td className="mono">{pair.pairNo}</td><td><Badge value={pair.status} /></td><td>{pair.adjudicatedPreference ? (pair.adjudicatedPreference === "TIE" ? "平票" : pair.adjudicatedPreference === "LEFT" ? "方案 A" : "方案 B") : "—"}</td><td>{experiment.status === "RUNNING" ? <Link className="btn small" href={"/experiments/" + id + "/blind/" + pair.id}>进入房间</Link> : "—"}</td></tr>)}</tbody></table></div></section>
    {manager ? <section className="card" style={{ marginTop: 16 }}><div className="card-head"><h2>候选设计</h2><span className="small muted">仅实验管理角色可见模型元数据</span></div>{candidates.length ? <div className="grid">{candidates.map((candidate: any) => <div className="check-row" key={candidate.id}><span className="mono">{candidate.candidateNo}</span><span style={{ flex: 1 }}>{candidate.title}</span><span className="small muted">{candidate.versions?.[0]?.modelProvider} / {candidate.versions?.[0]?.modelName} / {candidate.versions?.[0]?.modelVersion}</span><Badge value={candidate.status} /></div>)}</div> : <Empty>无候选</Empty>}</section> : null}
    {manager ? <section className="card" style={{ marginTop: 16 }}><div className="card-head"><div><h2>实验记录</h2><div className="card-sub">关闭后才能读取完整偏好、分数与裁决。</div></div><button className="btn" onClick={loadResults} disabled={experiment.status !== "CLOSED"}>读取结果</button></div>{results ? <div className="grid">{(results.comparisons ?? []).map((comparison: any) => <div className="card" key={comparison.id} style={{ boxShadow: "none" }}><div className="card-head"><strong>{comparison.preference === "TIE" ? "平票" : comparison.preference === "LEFT" ? "呈现左侧更优" : "呈现右侧更优"} · 置信度 {comparison.confidence}</strong><span className="small muted">{formatDate(comparison.submittedAt)}</span></div><div className="small">{comparison.rationale}</div></div>)}{!results.comparisons?.length ? <Empty>尚无可读取的比较记录</Empty> : null}</div> : <div className="small muted">{experiment.status === "CLOSED" ? "点击读取结果查看实验记录。" : "实验关闭前结果不可读取。"}</div>}</section> : null}
  </>;
}
