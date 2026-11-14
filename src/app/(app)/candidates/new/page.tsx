"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api, useApi } from "@/lib/client";
import { PageHeader, Empty } from "@/components/ui";
import { readScreenshotFile, screenshotFitHint, SCREENSHOT_ACCEPT, type ClientScreenshot } from "@/lib/client-image";

export default function NewCandidatePage() {
  const router = useRouter();
  const briefs = useApi<any[]>("/briefs");
  const [form, setForm] = useState({ title: "", briefId: "", modelProvider: "", modelName: "", modelVersion: "", html: "<!doctype html><html><head><meta charset=\"utf-8\"><style>body{padding:24px;font-family:Arial;color:#111;background:#fff}</style></head><body><h1>候选设计标题</h1><p>请用真实模型输出替换此示例，并确保正文、层级和图片位置完整。</p></body></html>" });
  const [screenshot, setScreenshot] = useState<ClientScreenshot | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  function set(key: string, value: string) { setForm((current) => ({ ...current, [key]: value })); }
  async function submit(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setMessage(null);
    try { const result: any = await api("/candidates", { method: "POST", body: JSON.stringify({ ...form, screenshotDataUrl: screenshot?.dataUrl ?? "" }) }); router.push("/candidates/" + result.id); }
    catch (error) { setMessage(error instanceof Error ? error.message : "提交失败"); }
    finally { setBusy(false); }
  }
  if (briefs.loading) return <div className="loading">加载 Brief…</div>;
  if (briefs.error) return <div className="error-box">{briefs.error}</div>;
  return <>
    <PageHeader title="提交候选设计" description="记录模型、版本与实验来源。候选必须包含 HTML 和截图；平台会自动识别、裁边并适配为 375px 或 750px 证据图。" action={<Link className="btn" href="/candidates">返回候选列表</Link>} />
    <form className="split-view" onSubmit={submit}>
      <div className="grid preview-sticky"><section className="card"><div className="card-head"><h2>原始截图</h2></div>{screenshot ? <img className="preview-image" src={screenshot.dataUrl} alt="候选截图预览" /> : <Empty>选择 PNG / JPEG / WebP / SVG 截图，无需预先裁切</Empty>}<input className="input" style={{ marginTop: 12 }} type="file" accept={SCREENSHOT_ACCEPT} onChange={async (event) => { const file = event.target.files?.[0]; if (!file) return; setMessage(null); try { setScreenshot(await readScreenshotFile(file)); } catch (uploadError) { setScreenshot(null); setMessage(uploadError instanceof Error ? uploadError.message : "无法读取截图"); } }} required /><div className="small muted" style={{ marginTop: 8 }}>{screenshotFitHint(screenshot)}</div></section><section className="card"><h2>HTML</h2><textarea className="textarea tall mono" value={form.html} onChange={(event) => set("html", event.target.value)} required /></section></div>
      <section className="card grid"><div className="form-grid"><div className="field full"><label>标题</label><input className="input" value={form.title} onChange={(event) => set("title", event.target.value)} required /></div><div className="field full"><label>Brief</label><select className="select" value={form.briefId} onChange={(event) => set("briefId", event.target.value)} required><option value="">选择 Brief</option>{briefs.data?.map((brief) => <option key={brief.id} value={brief.id}>{brief.briefNo} · {brief.title}</option>)}</select></div><div className="field"><label>模型供应商</label><input className="input" value={form.modelProvider} onChange={(event) => set("modelProvider", event.target.value)} required /></div><div className="field"><label>模型名称</label><input className="input" value={form.modelName} onChange={(event) => set("modelName", event.target.value)} required /></div><div className="field"><label>模型版本</label><input className="input" value={form.modelVersion} onChange={(event) => set("modelVersion", event.target.value)} required /></div></div><div className="notice">提交后候选状态为 SUBMITTED；运行五项硬检查全部通过后才会进入 READY_FOR_BLIND。</div>{message ? <div className="error-box">{message}</div> : null}<button className="btn primary" disabled={busy}>{busy ? "提交中…" : "提交候选"}</button></section>
    </form>
  </>;
}
