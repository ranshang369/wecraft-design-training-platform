"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api, useApi } from "@/lib/client";
import { PageHeader, Empty } from "@/components/ui";
import { ARCHETYPES } from "@/lib/constants";
import { readScreenshotFile, screenshotFitHint, SCREENSHOT_ACCEPT, type ClientScreenshot } from "@/lib/client-image";

const SOURCE_LABELS: Record<string, string> = { INTERNAL_ORIGINAL: "内部原创", USER_CONTENT: "用户内容", THIRD_PARTY: "第三方", PUBLIC_DOMAIN: "公共领域" };
export default function NewCounterexamplePage() {
  const router = useRouter();
  const briefs = useApi<any[]>("/briefs");
  const [form, setForm] = useState({ title: "", archetype: "GENRE", briefId: "", failureSummary: "", failureLabels: "", reproductionSteps: "", rootCause: "", repairSuggestion: "", applicableConditions: "", sourceType: "INTERNAL_ORIGINAL", sourceNote: "", html: "<!doctype html><html><head><meta charset=\"utf-8\"><style>body{padding:24px;font-family:Arial;color:#111;background:#fff}h1{background:#ddd;color:#eee}</style></head><body><h1>反例：层级只剩颜色</h1><p>请替换为可复现的真实失败样例，并说明根因与修复建议。</p></body></html>" });
  const [screenshot, setScreenshot] = useState<ClientScreenshot | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  function set(key: string, value: string) { setForm((current) => ({ ...current, [key]: value })); }
  async function submit(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setMessage(null);
    try { const payload = { ...form, briefId: form.briefId || null, failureLabels: form.failureLabels.split(/[，,]/).map((value) => value.trim()).filter(Boolean), applicableConditions: form.applicableConditions.split("\n").map((value) => value.trim()).filter(Boolean), screenshotDataUrl: screenshot?.dataUrl ?? "" }; const result: any = await api("/counterexamples", { method: "POST", body: JSON.stringify(payload) }); router.push("/counterexamples/" + result.id); }
    catch (error) { setMessage(error instanceof Error ? error.message : "保存失败"); }
    finally { setBusy(false); }
  }
  if (briefs.loading) return <div className="loading">加载 Brief…</div>;
  return <>
    <PageHeader title="新建反例" description="反例记录可复现失败、根因和修复建议。反例与优质案例是独立对象，不混在同一张表。" action={<Link className="btn" href="/cases">返回案例库</Link>} />
    <form className="split-view" onSubmit={submit}><div className="grid preview-sticky"><section className="card"><div className="card-head"><h2>原始截图</h2></div>{screenshot ? <img className="preview-image" src={screenshot.dataUrl} alt="反例截图" /> : <Empty>上传失败截图，无需预先裁切</Empty>}<input className="input" style={{ marginTop: 12 }} type="file" accept={SCREENSHOT_ACCEPT} onChange={async (event) => { const file = event.target.files?.[0]; if (!file) return; setMessage(null); try { setScreenshot(await readScreenshotFile(file)); } catch (uploadError) { setScreenshot(null); setMessage(uploadError instanceof Error ? uploadError.message : "无法读取截图"); } }} required /><div className="small muted" style={{ marginTop: 8 }}>{screenshotFitHint(screenshot)}</div></section><section className="card"><h2>HTML 证据</h2><textarea className="textarea tall mono" value={form.html} onChange={(event) => set("html", event.target.value)} required /></section></div><section className="card grid"><div className="form-grid"><div className="field full"><label>标题</label><input className="input" value={form.title} onChange={(event) => set("title", event.target.value)} required /></div><div className="field"><label>主型</label><select className="select" value={form.archetype} onChange={(event) => set("archetype", event.target.value)}>{ARCHETYPES.map((item) => <option key={item.code} value={item.code}>{item.label}</option>)}</select></div><div className="field"><label>来源 Brief</label><select className="select" value={form.briefId} onChange={(event) => set("briefId", event.target.value)}><option value="">不关联</option>{briefs.data?.map((brief) => <option key={brief.id} value={brief.id}>{brief.briefNo} · {brief.title}</option>)}</select></div><div className="field full"><label>失败摘要</label><textarea className="textarea" value={form.failureSummary} onChange={(event) => set("failureSummary", event.target.value)} required /></div><div className="field"><label>失败标签</label><input className="input" value={form.failureLabels} onChange={(event) => set("failureLabels", event.target.value)} placeholder="可读性，视觉机制" required /></div><div className="field"><label>来源类型</label><select className="select" value={form.sourceType} onChange={(event) => set("sourceType", event.target.value)}>{Object.entries(SOURCE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div><div className="field full"><label>复现步骤</label><textarea className="textarea" value={form.reproductionSteps} onChange={(event) => set("reproductionSteps", event.target.value)} required /></div><div className="field full"><label>根因</label><textarea className="textarea" value={form.rootCause} onChange={(event) => set("rootCause", event.target.value)} /></div><div className="field full"><label>修复建议</label><textarea className="textarea" value={form.repairSuggestion} onChange={(event) => set("repairSuggestion", event.target.value)} required /></div><div className="field full"><label>适用条件（每行一条）</label><textarea className="textarea" value={form.applicableConditions} onChange={(event) => set("applicableConditions", event.target.value)} /></div><div className="field full"><label>来源说明</label><input className="input" value={form.sourceNote} onChange={(event) => set("sourceNote", event.target.value)} required /></div></div>{message ? <div className="error-box">{message}</div> : null}<button className="btn primary" disabled={busy}>{busy ? "保存中…" : "保存反例"}</button></section></form>
  </>;
}
