"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, useApi } from "@/lib/client";
import { PageHeader } from "@/components/ui";
import { ARCHETYPES, DIMENSIONS } from "@/lib/constants";

function fileToDataUrl(file: File) { return new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = reject; reader.readAsDataURL(file); }); }
export default function NewCasePage() {
  const router = useRouter();
  const briefs = useApi<any[]>("/briefs");
  const [form, setForm] = useState<any>({ title: "", archetype: "MATERIAL", briefId: "", applicableConditions: "", designMechanism: "", antiPatterns: "", mechanismTags: "", sourceType: "INTERNAL_ORIGINAL", sourceNote: "内部原创演示案例", html: "<!doctype html><html><head><meta name=\"viewport\" content=\"width=device-width, initial-scale=1\"><title>示例</title><style>body{max-width:375px;padding:24px;background:#fff;color:#111;font-family:Arial}h1{font-family:Georgia;font-size:40px}</style></head><body><h1>这里写案例标题</h1><p>这里写案例正文。设计机制需要与内容结构发生关系，而不是仅仅增加装饰。</p></body></html>", selfScores: Object.fromEntries(DIMENSIONS.map((d) => [d.code, 4])) });
  const [screenshot, setScreenshot] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  function set(key: string, value: any) { setForm((f: any) => ({ ...f, [key]: value })); }
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setError(null);
    if (!screenshot) { setError("请上传 375px 截图"); return; }
    setLoading(true);
    try {
      const payload = { ...form, briefId: form.briefId || null, antiPatterns: form.antiPatterns.split("\n").map((x: string) => x.trim()).filter(Boolean), mechanismTags: form.mechanismTags.split(/[，,]/).map((x: string) => x.trim()).filter(Boolean), screenshotDataUrl: screenshot, selfScores: Object.fromEntries(Object.entries(form.selfScores).map(([k, v]) => [k, Number(v)])) };
      const created: any = await api("/cases", { method: "POST", body: JSON.stringify(payload) });
      router.push("/cases/" + created.id);
    } catch (err) { setError(err instanceof Error ? err.message : "保存失败"); }
    finally { setLoading(false); }
  }
  return <>
    <PageHeader title="新建优质案例" description="案例卡分为左侧截图证据和右侧结构化字段。提交前必须至少上传一张 375px 截图与 HTML。" action={<a className="btn" href="/cases">返回案例库</a>} />
    <form onSubmit={submit} className="split-view">
      <div className="grid preview-sticky"><div className="card"><div className="card-head"><h2>375px 截图</h2>{screenshot ? <span className="badge green">已上传</span> : <span className="badge gray">待上传</span>}</div>{screenshot ? <img className="preview-image" src={screenshot} alt="375px 案例截图预览" /> : <div className="empty" style={{ minHeight: 260 }}>上传宽度 375px 的截图<br /><span className="small">PNG / JPG / SVG</span></div>}<input className="input" style={{ marginTop: 12 }} type="file" accept="image/*" onChange={async (e) => { const file = e.target.files?.[0]; if (file) setScreenshot(await fileToDataUrl(file)); }} /></div><div className="card"><h3>HTML 证据预览</h3><div className="small muted" style={{ margin: "6px 0 10px" }}>最终预览会在服务端清洗后放入 sandbox iframe；这里仅展示编辑内容。</div><textarea className="textarea tall mono" value={form.html} onChange={(e) => set("html", e.target.value)} /></div></div>
      <div className="card grid"><div className="form-grid"><div className="field full"><label>案例标题</label><input className="input" value={form.title} onChange={(e) => set("title", e.target.value)} required /></div><div className="field"><label>主型</label><select className="select" value={form.archetype} onChange={(e) => set("archetype", e.target.value)}>{ARCHETYPES.map((a) => <option key={a.code} value={a.code}>{a.label}</option>)}</select></div><div className="field"><label>来源 Brief</label><select className="select" value={form.briefId} onChange={(e) => set("briefId", e.target.value)}><option value="">不关联</option>{briefs.data?.map((b) => <option key={b.id} value={b.id}>{b.briefNo} · {b.title}</option>)}</select></div><div className="field full"><label>适用内容条件</label><textarea className="textarea" value={form.applicableConditions} onChange={(e) => set("applicableConditions", e.target.value)} required /><span className="hint">什么内容适合使用这个机制？不适用条件是什么？</span></div><div className="field full"><label>设计机制</label><textarea className="textarea" value={form.designMechanism} onChange={(e) => set("designMechanism", e.target.value)} required /></div><div className="field"><label>机制标签</label><input className="input" value={form.mechanismTags} onChange={(e) => set("mechanismTags", e.target.value)} placeholder="材料同构，标题层级" /><span className="hint">用逗号分隔</span></div><div className="field"><label>来源类型</label><select className="select" value={form.sourceType} onChange={(e) => set("sourceType", e.target.value)}><option value="INTERNAL_ORIGINAL">内部原创</option><option value="USER_CONTENT">用户内容</option><option value="THIRD_PARTY">第三方</option><option value="PUBLIC_DOMAIN">公共领域</option></select></div><div className="field full"><label>反模式</label><textarea className="textarea" value={form.antiPatterns} onChange={(e) => set("antiPatterns", e.target.value)} placeholder="每行一条" /></div><div className="field full"><label>来源说明</label><input className="input" value={form.sourceNote} onChange={(e) => set("sourceNote", e.target.value)} required /></div></div>
        <div><h3 style={{ marginBottom: 10 }}>六维自评</h3><div className="score-grid">{DIMENSIONS.map((d) => <div className="score-field" key={d.code}><span>{d.label}{d.code === "IMAGE_NARRATIVE" ? <span className="hint">（无图可选 N/A）</span> : null}</span><select className="select" value={form.selfScores[d.code]} onChange={(e) => set("selfScores", { ...form.selfScores, [d.code]: e.target.value })}><option value="N/A">N/A</option>{[1,2,3,4,5].map((v) => <option key={v} value={v}>{v}</option>)}</select></div>)}</div></div>
        <div className="notice">授权字段默认全部为 false。案例创建后由 Owner/Design Lead 在详情页填写并保存授权证据。</div>{error ? <div className="error-box">{error}</div> : null}<div className="actions"><button className="btn primary" type="submit" disabled={loading}>{loading ? "保存中…" : "保存案例卡并进入详情"}</button></div></div>
    </form>
  </>;
}

