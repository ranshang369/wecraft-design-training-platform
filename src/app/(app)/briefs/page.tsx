"use client";
import Link from "next/link";
import { useState } from "react";
import { useApi, api, formatDate } from "@/lib/client";
import { PageHeader, Badge, Empty } from "@/components/ui";
import { STATUS_LABELS } from "@/lib/constants";

const emptyForm = { title: "", purpose: "CASE_SOURCE", split: "DEV", manuscriptMarkdown: "", targetAudience: "", designCommission: "", brandRequirements: "", prohibitedItems: "" };
export default function BriefsPage() {
  const { data, error, loading, reload } = useApi<any[]>("/briefs");
  const [form, setForm] = useState<any>(emptyForm);
  const [showForm, setShowForm] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  async function create(e: React.FormEvent) {
    e.preventDefault(); setMessage(null);
    try { await api("/briefs", { method: "POST", body: JSON.stringify({ ...form, images: [], hardConstraints: [], acceptableArchetypes: [], mustAvoid: [] }) }); setForm(emptyForm); setShowForm(false); setMessage("Brief 已创建"); await reload(); }
    catch (err) { setMessage(err instanceof Error ? err.message : "创建失败"); }
  }
  function set(key: string, value: string) { setForm((current: any) => ({ ...current, [key]: value })); }
  return <>
    <PageHeader title="Brief 管理" description="Brief 是内容需求与设计委托的结构化版本。普通角色看不到 Holdout 正文；只有 Owner/Admin 可查看。" action={<button className="btn primary" onClick={() => setShowForm(!showForm)}>{showForm ? "收起表单" : "新建 Brief"}</button>} />
    {showForm ? <form className="card grid" onSubmit={create} style={{ marginBottom: 16 }}><div className="form-grid"><div className="field"><label>标题</label><input className="input" value={form.title} onChange={(e) => set("title", e.target.value)} required /></div><div className="field"><label>用途</label><select className="select" value={form.purpose} onChange={(e) => set("purpose", e.target.value)}><option value="CASE_SOURCE">案例来源</option><option value="GOLDEN_EVAL">黄金评测</option><option value="BOTH">案例 + 评测</option></select></div><div className="field"><label>数据集拆分</label><select className="select" value={form.split} onChange={(e) => set("split", e.target.value)}><option value="DEV">研发集</option><option value="HOLDOUT">保留集</option></select></div><div className="field"><label>目标读者</label><input className="input" value={form.targetAudience} onChange={(e) => set("targetAudience", e.target.value)} required /></div><div className="field full"><label>正文 Markdown</label><textarea className="textarea tall" value={form.manuscriptMarkdown} onChange={(e) => set("manuscriptMarkdown", e.target.value)} required /></div><div className="field"><label>设计委托</label><textarea className="textarea" value={form.designCommission} onChange={(e) => set("designCommission", e.target.value)} required /></div><div className="field"><label>品牌要求</label><textarea className="textarea" value={form.brandRequirements} onChange={(e) => set("brandRequirements", e.target.value)} required /></div><div className="field full"><label>禁止项</label><textarea className="textarea" value={form.prohibitedItems} onChange={(e) => set("prohibitedItems", e.target.value)} required /></div></div>{message ? <div className={message === "Brief 已创建" ? "success-box" : "error-box"}>{message}</div> : null}<div className="actions"><button className="btn primary">保存 Brief</button></div></form> : null}
    {error ? <div className="error-box">{error}</div> : null}
    {loading ? <div className="loading">加载中…</div> : !data?.length ? <Empty>还没有 Brief。先创建内容需求，再从案例库建立案例卡。</Empty> : <div className="card flush"><div className="table-wrap"><table><thead><tr><th>编号 / 标题</th><th>用途</th><th>拆分</th><th>状态</th><th>版本</th><th>案例</th><th>更新时间</th></tr></thead><tbody>{data.map((row) => <tr key={row.id} className="row-link"><td><Link href={"/briefs/" + row.id}><strong>{row.briefNo}</strong> · {row.title}</Link></td><td>{STATUS_LABELS[row.purpose] ?? row.purpose}</td><td><Badge value={row.split} /></td><td><Badge value={row.status} /></td><td>v{row.currentVersion}</td><td>{row._count?.cases ?? 0}</td><td className="small muted">{formatDate(row.updatedAt)}</td></tr>)}</tbody></table></div></div>}
  </>;
}

