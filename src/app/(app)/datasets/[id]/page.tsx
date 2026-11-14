"use client";
import Link from "next/link";
import { use, useEffect, useState } from "react";
import { api, useApi, formatDate } from "@/lib/client";
import { PageHeader, Badge, Empty } from "@/components/ui";

const TYPE_LABELS: Record<string, string> = { CASE: "优质案例", BRIEF: "Brief", COUNTEREXAMPLE: "反例", CANDIDATE: "候选", PREFERENCE: "偏好" };
export default function DatasetDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const query = useApi<any>("/datasets/" + id);
  const me = useApi<any>("/auth/me");
  const [blockers, setBlockers] = useState<any[]>([]);
  const [warnings, setWarnings] = useState<any[]>([]);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const roles: string[] = me.data?.roles ?? [];
  const canValidate = roles.some((role) => ["OWNER","DESIGN_LEAD","AI_ENGINEER"].includes(role));
  const canApprove = roles.some((role) => ["OWNER","DESIGN_LEAD"].includes(role));
  const canExport = roles.some((role) => ["OWNER","ADMIN","DESIGN_LEAD"].includes(role));
  useEffect(() => {
    const existing = query.data?.eligibilitySnapshot?.blockers;
    if (Array.isArray(existing)) setBlockers(existing);
    const existingWarnings = query.data?.eligibilitySnapshot?.warnings;
    if (Array.isArray(existingWarnings)) setWarnings(existingWarnings);
  }, [query.data]);
  if (query.loading) return <div className="loading">加载数据集…</div>;
  if (query.error) return <div className="error-box">{query.error}</div>;
  const dataset = query.data;
  if (!dataset) return <Empty>数据集不存在。</Empty>;
  async function action(path: string, success: string) {
    setBusy(true); setMessage(null);
    try {
      const result: any = await api("/datasets/" + id + path, { method: "POST" });
      if (result?.blockers) setBlockers(result.blockers);
      if (result?.warnings) setWarnings(result.warnings);
      if (result?.downloadUrl) setDownloadUrl(result.downloadUrl);
      await query.reload();
      setMessage({
        ok: result?.blockers?.length ? false : true,
        text: result?.blockers?.length
          ? "校验存在阻断项，已阻止导出。"
          : result?.warnings?.length
            ? success + " 另有 " + result.warnings.length + " 条质量建议，不影响批准与导出。"
            : success,
      });
    } catch (error) { setMessage({ ok: false, text: error instanceof Error ? error.message : "操作失败" }); }
    finally { setBusy(false); }
  }
  return <>
    <PageHeader title={dataset.datasetNo + " · " + dataset.name} description={"版本 v" + dataset.version + " · " + (dataset.type === "TRAIN" ? "训练集" : "评测集") + " · 冻结后按版本导出"} action={<><Link className="btn" href="/datasets">返回数据集</Link><Badge value={dataset.status} /></>} />
    {message ? <div className={message.ok ? "success-box" : "error-box"} style={{ marginBottom: 14 }}>{message.text}</div> : null}
    <div className="grid grid-4" style={{ marginBottom: 16 }}><div className="card"><div className="stat-label">条目</div><div className="stat-value">{dataset.itemCount}</div></div><div className="card"><div className="stat-label">状态</div><div style={{ marginTop: 10 }}><Badge value={dataset.status} /></div></div><div className="card"><div className="stat-label">清单 hash</div><div className="mono small" style={{ marginTop: 10 }}>{dataset.manifestHash?.slice(0, 18) ?? "尚未校验"}…</div></div><div className="card"><div className="stat-label">冻结时间</div><div style={{ marginTop: 10 }}>{formatDate(dataset.frozenAt)}</div></div></div>
    <div className="grid grid-2">
      <section className="card"><div className="card-head"><div><h2>校验与导出</h2><div className="card-sub">校验会检查资格、双评、授权和 Holdout 规则；批准后冻结条目版本与授权快照。</div></div></div><div className="actions">{canValidate && !["APPROVED","READY"].includes(dataset.status) ? <button className="btn" disabled={busy} onClick={() => action("/validate", "校验通过，等待批准。")}>执行校验</button> : null}{canApprove && dataset.status === "READY_FOR_APPROVAL" ? <button className="btn primary" disabled={busy} onClick={() => action("/approve", "数据集已批准并冻结。")}>批准数据集</button> : null}{canExport && ["APPROVED","READY"].includes(dataset.status) ? <button className="btn accent" disabled={busy} onClick={() => action("/export", "导出已生成，下载链接 15 分钟内有效。")}>导出 JSONL / CSV ZIP</button> : null}</div>{downloadUrl ? <div className="success-box" style={{ marginTop: 12 }}><a href={downloadUrl}><strong>下载导出包</strong></a><div className="small">导出动作已写入审计；下载还会单独记录。</div></div> : null}<div className="notice" style={{ marginTop: 12 }}>训练集只接受 canUseForTraining=true；评测集只接受 canUseForEvaluation=true。授权不完整时服务端拒绝导出。</div></section>
      <section className="card"><div className="card-head"><div><h2>阻断项与质量建议</h2><div className="card-sub">阻断项必须修复；质量建议可继续打磨，但不影响批准与导出。</div></div><Badge value={blockers.length ? "BLOCKED" : dataset.status === "READY_FOR_APPROVAL" ? "READY_FOR_APPROVAL" : "READY"} /></div>{blockers.length ? <div className="grid">{blockers.map((blocker, index) => <div className="error-box" key={blocker.itemId + "-" + blocker.code + "-" + index}><strong>{blocker.code}</strong> · {blocker.message}</div>)}</div> : <div className="success-box">没有阻断项。仍须 Owner/Design Lead 批准后才能导出。</div>}{warnings.length ? <div className="grid" style={{ marginTop: 12 }}>{warnings.map((warning, index) => <div className="notice" key={warning.itemId + "-" + warning.code + "-" + index}><strong>{warning.code}</strong> · {warning.message}</div>)}</div> : null}</section>
    </div>
    <section className="card" style={{ marginTop: 16 }}><div className="card-head"><h2>条目与授权快照</h2><span className="small muted">{dataset.items?.length ?? 0} 条</span></div>{dataset.items?.length ? <div className="table-wrap"><table><thead><tr><th>类型</th><th>对象</th><th>状态</th><th>训练授权</th><th>评测授权</th><th>证据</th></tr></thead><tbody>{dataset.items.map((item: any) => { const snapshot = item.snapshot ?? {}; const rights = item.rightsSnapshot ?? {}; return <tr key={item.id}><td>{TYPE_LABELS[item.itemType] ?? item.itemType}</td><td><strong>{snapshot.caseNo ?? snapshot.briefNo ?? snapshot.counterexampleNo ?? snapshot.candidateNo ?? item.id}</strong><div className="small muted">{snapshot.title}</div></td><td><Badge value={item.status} /></td><td>{rights.canUseForTraining ? "允许" : "不允许"}</td><td>{rights.canUseForEvaluation ? "允许" : "不允许"}</td><td>{rights.evidenceStatus ?? "—"}</td></tr>; })}</tbody></table></div> : <Empty>数据集没有条目。</Empty>}</section>
    <section className="card" style={{ marginTop: 16 }}><div className="card-head"><h2>导出历史</h2></div>{dataset.exports?.length ? <div className="table-wrap"><table><thead><tr><th>导出号</th><th>类型</th><th>状态</th><th>内容 hash</th><th>导出人</th><th>时间</th><th>下载</th></tr></thead><tbody>{dataset.exports.map((row: any) => <tr key={row.id}><td className="mono">{row.exportNo}</td><td>{row.datasetVersion}</td><td><Badge value={row.status} /></td><td className="mono small">{row.contentHash?.slice(0, 16)}…</td><td className="small muted">{row.exportedBy}</td><td className="small muted">{formatDate(row.exportedAt)}</td><td>{row.expiresAt && new Date(row.expiresAt) > new Date() ? <a className="btn small" href={"/api/v1/datasets/" + id + "/exports/" + row.id + "/download"}>下载</a> : <span className="small muted">已过期</span>}</td></tr>)}</tbody></table></div> : <Empty>还没有导出记录。</Empty>}</section>
  </>;
}
