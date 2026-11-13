"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api, useApi } from "@/lib/client";
import { PageHeader } from "@/components/ui";
import { DIMENSIONS } from "@/lib/constants";
import {
  INTENT_TAGS,
  START_POINTS,
  VISUAL_GRAMMAR_FIELDS,
  caseMetadataIssues,
} from "@/lib/case-metadata";

const EMPTY_HTML = `<!doctype html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>案例</title>
  <style>
    body{max-width:375px;margin:0 auto;padding:0;background:#f2eee4;color:#171512;font-family:Georgia,"Songti SC",serif}
    .page{padding:32px 20px 56px}
    .eyebrow{font:10px/1.4 ui-monospace,monospace;letter-spacing:.22em}
    h1{font-size:46px;line-height:1.03;margin:18px 0 22px}
    p{font-size:15px;line-height:1.9;margin:0 0 18px}
  </style>
</head>
<body><main class="page"><div class="eyebrow">FIELD NOTE / 01</div><h1>这里写案例标题</h1><p>这里写案例正文。先让内容决定空间、材料与阅读节奏，再决定装饰。</p></main></body>
</html>`;

function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function emptyVisualGrammar() {
  return Object.fromEntries(VISUAL_GRAMMAR_FIELDS.map((field) => [field.key, ""])) as Record<string, string>;
}

export default function NewCasePage() {
  const router = useRouter();
  const briefs = useApi<any[]>("/briefs");
  const [form, setForm] = useState<any>({
    title: "",
    startPoints: [] as string[],
    intentTags: [] as string[],
    briefId: "",
    applicableConditions: "",
    designMechanism: "",
    bodyMechanism: "",
    structureSignature: "",
    visualGrammar: emptyVisualGrammar(),
    antiPatterns: "",
    mechanismTags: "",
    sourceType: "INTERNAL_ORIGINAL",
    sourceNote: "内部原创演示案例",
    html: EMPTY_HTML,
    selfScores: Object.fromEntries(DIMENSIONS.map((dimension) => [dimension.code, 4])),
  });
  const [screenshot, setScreenshot] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function set(key: string, value: any) {
    setForm((current: any) => ({ ...current, [key]: value }));
  }

  function setVisual(key: string, value: string) {
    setForm((current: any) => ({
      ...current,
      visualGrammar: { ...current.visualGrammar, [key]: value },
    }));
  }

  function toggleStartPoint(id: string) {
    setForm((current: any) => {
      const active = current.startPoints.includes(id);
      if (!active && current.startPoints.length >= 3) return current;
      return {
        ...current,
        startPoints: active
          ? current.startPoints.filter((value: string) => value !== id)
          : [...current.startPoints, id],
      };
    });
  }

  function toggleIntentTag(id: string) {
    setForm((current: any) => ({
      ...current,
      intentTags: current.intentTags.includes(id)
        ? current.intentTags.filter((value: string) => value !== id)
        : [...current.intentTags, id],
    }));
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    if (!screenshot) {
      setError("请上传 375px 截图");
      return;
    }
    if (!form.startPoints.length) {
      setError("请选择至少一个用户侧起稿起点");
      return;
    }
    const metadataIssues = caseMetadataIssues(form);
    if (metadataIssues.length) {
      setError(metadataIssues.join("；"));
      return;
    }

    setLoading(true);
    try {
      const payload = {
        ...form,
        briefId: form.briefId || null,
        antiPatterns: form.antiPatterns.split("\n").map((value: string) => value.trim()).filter(Boolean),
        mechanismTags: form.mechanismTags.split(/[，,]/).map((value: string) => value.trim()).filter(Boolean),
        screenshotDataUrl: screenshot,
        selfScores: Object.fromEntries(
          Object.entries(form.selfScores).map(([key, value]) => [key, value === "N/A" ? null : Number(value)]),
        ),
      };
      const created: any = await api("/cases", { method: "POST", body: JSON.stringify(payload) });
      router.push("/cases/" + created.id);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "保存失败");
    } finally {
      setLoading(false);
    }
  }

  return <>
    <PageHeader
      title="新建优质案例"
      description="按真实阅读任务选择起稿起点，再记录正文承接与七项视觉语法。截图和 HTML 只是证据，可迁移的机制才是训练资产。"
      action={<a className="btn" href="/cases">返回案例库</a>}
    />
    <form onSubmit={submit} className="split-view">
      <div className="grid preview-sticky">
        <div className="card">
          <div className="card-head"><h2>375px 截图</h2>{screenshot ? <span className="badge green">已上传</span> : <span className="badge gray">待上传</span>}</div>
          {screenshot
            ? <img className="preview-image" src={screenshot} alt="375px 案例截图预览" />
            : <div className="empty" style={{ minHeight: 260 }}>上传宽度 375px 的截图<br /><span className="small">PNG / JPG / WEBP / SVG</span></div>}
          <input className="input" style={{ marginTop: 12 }} type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" onChange={async (event) => {
            const file = event.target.files?.[0];
            if (file) setScreenshot(await fileToDataUrl(file));
          }} />
        </div>
        <div className="card">
          <h3>HTML 证据</h3>
          <div className="small muted" style={{ margin: "6px 0 10px" }}>最终预览会在服务端清洗后放入 sandbox iframe；这里展示的是原始案例文件。</div>
          <textarea className="textarea tall mono" value={form.html} onChange={(event) => set("html", event.target.value)} />
        </div>
      </div>

      <div className="card grid">
        <div className="form-grid">
          <div className="field full"><label>案例标题</label><input className="input" value={form.title} onChange={(event) => set("title", event.target.value)} required /></div>
          <div className="field"><label>来源 Brief</label><select className="select" value={form.briefId} onChange={(event) => set("briefId", event.target.value)}><option value="">不关联</option>{briefs.data?.map((brief) => <option key={brief.id} value={brief.id}>{brief.briefNo} · {brief.title}</option>)}</select></div>
          <div className="field"><label>来源类型</label><select className="select" value={form.sourceType} onChange={(event) => set("sourceType", event.target.value)}><option value="INTERNAL_ORIGINAL">内部原创</option><option value="USER_CONTENT">用户内容</option><option value="THIRD_PARTY">第三方</option><option value="PUBLIC_DOMAIN">公共领域</option></select></div>

          <div className="field full">
            <label>用户侧起稿起点（1–3 个，首个为主）</label>
            <div style={{ display: "grid", gap: 6, marginTop: 6 }}>
              {START_POINTS.map((point) => <label key={point.id} style={{ display: "flex", gap: 8, alignItems: "flex-start", padding: "7px 9px", border: "1px solid var(--line)", borderRadius: 7, background: "#fffdf8" }}><input type="checkbox" checked={form.startPoints.includes(point.id)} onChange={() => toggleStartPoint(point.id)} /><span><strong>{point.label}</strong><span className="small muted" style={{ display: "block" }}>{point.description}</span></span></label>)}
            </div>
            <span className="hint">九主型只保留为内部检索兼容，不再要求用户理解或选择。</span>
          </div>

          <div className="field full">
            <label>意图标签（可选）</label>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 6 }}>{INTENT_TAGS.map((tag) => <label key={tag.id} style={{ display: "flex", gap: 5, alignItems: "center", padding: "5px 9px", border: "1px solid var(--line)", borderRadius: 999, background: form.intentTags.includes(tag.id) ? "#f8e4da" : "#fffdf8" }}><input type="checkbox" checked={form.intentTags.includes(tag.id)} onChange={() => toggleIntentTag(tag.id)} />{tag.label}</label>)}</div>
          </div>

          <div className="field full"><label>适用内容条件</label><textarea className="textarea" value={form.applicableConditions} onChange={(event) => set("applicableConditions", event.target.value)} required /><span className="hint">什么内容适合使用这个机制？什么情况下必须放弃？</span></div>
          <div className="field full"><label>设计机制（首屏 / 整体视觉判断）</label><textarea className="textarea" value={form.designMechanism} onChange={(event) => set("designMechanism", event.target.value)} required /></div>
          <div className="field full"><label>正文承接机制</label><textarea className="textarea" value={form.bodyMechanism} onChange={(event) => set("bodyMechanism", event.target.value)} required /><span className="hint">首屏之后，章节如何继续兑现同一机制？不能只描述封面。</span></div>
          <div className="field full"><label>结构签名</label><textarea className="textarea" value={form.structureSignature} onChange={(event) => set("structureSignature", event.target.value)} placeholder="例如：wide-image-entry > narrow-body > image-pause > human-action-close" required /><span className="hint">用至少三个可比较的阅读步骤描述骨架，便于检索与去重。</span></div>
          <div className="field"><label>机制标签</label><input className="input" value={form.mechanismTags} onChange={(event) => set("mechanismTags", event.target.value)} placeholder="摄影拼贴，纸层错位，路线图" /><span className="hint">用逗号分隔</span></div>
          <div className="field"><label>来源说明</label><input className="input" value={form.sourceNote} onChange={(event) => set("sourceNote", event.target.value)} required /></div>
          <div className="field full"><label>反模式（每行一条）</label><textarea className="textarea" value={form.antiPatterns} onChange={(event) => set("antiPatterns", event.target.value)} placeholder="不要把所有图片做成同一矩形&#10;不要让每个章节都加一条细横线" /></div>
        </div>

        <section style={{ marginTop: 22 }}>
          <div className="card-head"><div><h3>七项视觉语法</h3><div className="card-sub">记录可以被迁移到别的内容上的设计规则，不记录案例独有文案或资产。</div></div></div>
          <div className="form-grid" style={{ marginTop: 12 }}>
            {VISUAL_GRAMMAR_FIELDS.map((field) => <div className="field full" key={field.key}><label>{field.label}</label><textarea className="textarea" value={form.visualGrammar[field.key]} onChange={(event) => setVisual(field.key, event.target.value)} required /><span className="hint">{field.hint}</span></div>)}
          </div>
        </section>

        <section style={{ marginTop: 22 }}>
          <h3 style={{ marginBottom: 10 }}>六维自评</h3>
          <div className="score-grid">{DIMENSIONS.map((dimension) => <div className="score-field" key={dimension.code}><span>{dimension.label}{dimension.code === "IMAGE_NARRATIVE" ? <span className="hint">（无图可选 N/A）</span> : null}</span><select className="select" value={form.selfScores[dimension.code]} onChange={(event) => set("selfScores", { ...form.selfScores, [dimension.code]: event.target.value })}><option value="N/A">N/A</option>{[1, 2, 3, 4, 5].map((value) => <option key={value} value={value}>{value}</option>)}</select></div>)}</div>
        </section>

        <div className="notice">授权字段默认全部为 false。案例创建后由 Owner / Design Lead 在详情页填写并保存授权证据；缺少七项视觉语法或正文承接机制的数据集将被阻断导出。</div>
        {error ? <div className="error-box">{error}</div> : null}
        <div className="actions"><button className="btn primary" type="submit" disabled={loading}>{loading ? "保存中…" : "保存案例卡并进入详情"}</button></div>
      </div>
    </form>
  </>;
}
