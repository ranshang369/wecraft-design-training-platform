"use client";
import Link from "next/link";
import { use, useState, useEffect } from "react";
import { api, useApi, formatDate } from "@/lib/client";
import { PageHeader, Badge, Empty } from "@/components/ui";

export default function BriefDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data, error, loading, reload } = useApi<any>("/briefs/" + id);
  const me = useApi<any>("/auth/me");
  const [form, setForm] = useState<any>(null);
  const [message, setMessage] = useState<string | null>(null);
  useEffect(() => { if (data?.versions?.[0] && !form) { const v = data.versions[0]; setForm({ title: data.title, purpose: data.purpose, split: data.split, manuscriptMarkdown: v.manuscriptMarkdown, images: v.images ?? [], targetAudience: v.targetAudience, designCommission: v.designCommission, brandRequirements: v.brandRequirements, prohibitedItems: v.prohibitedItems, userIntent: v.userIntent ?? "", hardConstraints: v.hardConstraints ?? [], acceptableArchetypes: v.acceptableArchetypes ?? [], mustAvoid: v.mustAvoid ?? [], rubricTargets: v.rubricTargets ?? {}, acceptanceNotes: v.acceptanceNotes ?? "" }); } }, [data, form]);
  if (loading) return <div className="loading">加载中…</div>;
  if (error) return <div className="error-box">{error}</div>;
  if (!data) return <Empty>Brief 不存在或你没有权限查看。</Empty>;
  async function saveVersion(e: React.FormEvent) {
    e.preventDefault(); setMessage(null);
    try { await api("/briefs/" + id, { method: "PATCH", body: JSON.stringify(form) }); setMessage("已生成新版本"); await reload(); }
    catch (err) { setMessage(err instanceof Error ? err.message : "保存失败"); }
  }
  function set(key: string, value: string) { setForm((current: any) => ({ ...current, [key]: value })); }
  async function approve() { try { await api("/briefs/" + id + "/approve", { method: "POST" }); setMessage("Brief 已批准"); await reload(); } catch (err) { setMessage(err instanceof Error ? err.message : "批准失败"); } }
  const canApprove = (me.data?.roles ?? []).some((role: string) => ["OWNER", "DESIGN_LEAD", "CONTENT_LEAD"].includes(role));
  return <>
    <PageHeader title={data.title} description={data.briefNo + " · " + (data.purpose === "CASE_SOURCE" ? "案例来源" : data.purpose === "GOLDEN_EVAL" ? "黄金评测" : "案例 + 评测")} action={<><Link className="btn" href="/briefs">返回列表</Link>{canApprove && data.status === "DRAFT" ? <button className="btn primary" onClick={approve}>批准 Brief</button> : null}<span className="badge blue">当前 v{data.currentVersion}</span></>} />
    <div className="grid grid-2" style={{ alignItems: "start" }}>
      <div className="grid">
        <section className="card"><div className="card-head"><h2>当前内容</h2><Badge value={data.status} /></div><div className="detail-list"><div><dt>拆分</dt><dd><Badge value={data.split} /></dd></div><div><dt>目标读者</dt><dd>{data.versions[0]?.targetAudience}</dd></div><div><dt>设计委托</dt><dd>{data.versions[0]?.designCommission}</dd></div><div><dt>品牌要求</dt><dd>{data.versions[0]?.brandRequirements}</dd></div><div><dt>禁止项</dt><dd>{data.versions[0]?.prohibitedItems}</dd></div><div><dt>内容 hash</dt><dd className="mono small">{data.versions[0]?.contentHash?.slice(0, 16)}…</dd></div></div><div style={{ marginTop: 16, whiteSpace: "pre-wrap", background: "var(--panel-2)", padding: 14, borderRadius: 8 }}>{data.versions[0]?.manuscriptMarkdown}</div></section>
        <section className="card"><div className="card-head"><h2>版本历史</h2><span className="small muted">旧版本不可修改</span></div><div className="timeline">{data.versions.map((v: any) => <div className="timeline-item" key={v.id}><div className="small muted">v{v.version} · {formatDate(v.createdAt)}</div><div><div>{v.targetAudience}</div><div className="small muted mono">{v.contentHash.slice(0, 20)}…</div></div></div>)}</div></section>
        <section className="card"><div className="card-head"><h2>关联案例</h2></div>{data.cases?.length ? <div className="grid">{data.cases.map((c: any) => <Link className="card" href={"/cases/" + c.id} key={c.id}><strong>{c.caseNo} · {c.title}</strong><div className="small muted">{c.status}</div></Link>)}</div> : <Empty>还没有关联案例。</Empty>}</section>
      </div>
      <form className="card grid" onSubmit={saveVersion}><div className="card-head"><div><h2>新增版本</h2><div className="card-sub">保存后会生成 v{Number(data.currentVersion) + 1}，原版本与结构化约束保留。</div></div></div>{form ? <><div className="field"><label>标题</label><input className="input" value={form.title} onChange={(e) => set("title", e.target.value)} required /></div><div className="form-grid"><div className="field"><label>用途</label><select className="select" value={form.purpose} onChange={(e) => set("purpose", e.target.value)}><option value="CASE_SOURCE">案例来源</option><option value="GOLDEN_EVAL">黄金评测</option><option value="BOTH">案例 + 评测</option></select></div><div className="field"><label>拆分</label><select className="select" value={form.split} onChange={(e) => set("split", e.target.value)}><option value="DEV">研发集</option><option value="HOLDOUT">保留集</option></select></div></div><div className="field"><label>正文 Markdown</label><textarea className="textarea tall" value={form.manuscriptMarkdown} onChange={(e) => set("manuscriptMarkdown", e.target.value)} required /></div><div className="field"><label>用户意图</label><textarea className="textarea" value={form.userIntent} onChange={(e) => set("userIntent", e.target.value)} /></div><div className="field"><label>目标读者</label><input className="input" value={form.targetAudience} onChange={(e) => set("targetAudience", e.target.value)} required /></div><div className="field"><label>设计委托</label><textarea className="textarea" value={form.designCommission} onChange={(e) => set("designCommission", e.target.value)} required /></div><div className="field"><label>品牌要求</label><textarea className="textarea" value={form.brandRequirements} onChange={(e) => set("brandRequirements", e.target.value)} required /></div><div className="field"><label>禁止项</label><textarea className="textarea" value={form.prohibitedItems} onChange={(e) => set("prohibitedItems", e.target.value)} required /></div>{message ? <div className={message === "已生成新版本" ? "success-box" : "error-box"}>{message}</div> : null}<button className="btn primary">保存为新版本</button></> : null}</form>
    </div>
  </>;
}

