"use client";
import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { api, useApi } from "@/lib/client";
import { PageHeader } from "@/components/ui";
import { DIMENSIONS } from "@/lib/constants";
import { readScreenshotFile, screenshotFitHint, SCREENSHOT_ACCEPT, type ClientScreenshot } from "@/lib/client-image";
import {
  INTENT_TAGS,
  START_POINTS,
  VISUAL_GRAMMAR_FIELDS,
  caseMetadataReview,
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
  const [screenshot, setScreenshot] = useState<ClientScreenshot | null>(null);
  const [previewTab, setPreviewTab] = useState<"screenshot" | "html">("screenshot");
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
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
    setWarnings([]);
    if (!screenshot) {
      setError("请上传截图");
      return;
    }
    if (!form.startPoints.length) {
      setError("请选择至少一个用户侧起稿起点");
      return;
    }
    const metadata = caseMetadataReview(form);
    if (metadata.errors.length) {
      setError(metadata.errors.join("；"));
      return;
    }
    setWarnings(metadata.warnings);

    setLoading(true);
    try {
      const payload = {
        ...form,
        briefId: form.briefId || null,
        antiPatterns: form.antiPatterns.split("\n").map((value: string) => value.trim()).filter(Boolean),
        mechanismTags: form.mechanismTags.split(/[，,]/).map((value: string) => value.trim()).filter(Boolean),
        screenshotDataUrl: screenshot.dataUrl,
        selfScores: Object.fromEntries(
          Object.entries(form.selfScores).map(([key, value]) => [key, value === "N/A" ? null : Number(value)]),
        ),
      };
      const created: any = await api("/cases", { method: "POST", body: JSON.stringify(payload) });
      const responseWarnings = Array.isArray(created.warnings) ? created.warnings : metadata.warnings;
      if (responseWarnings.length) {
        window.sessionStorage.setItem("wecraft-case-warnings", JSON.stringify(responseWarnings));
      }
      router.push("/cases/" + created.id);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "保存失败");
    } finally {
      setLoading(false);
    }
  }

  return <>
    <PageHeader
      title="录入优质案例"
      description="按真实阅读任务选择起稿起点，再记录正文承接与七项视觉语法。截图和 HTML 是证据，可迁移的机制才是训练资产。"
      action={<><Link className="btn" href="/cases">返回案例库</Link><button className="btn primary cta" type="submit" form="case-create-form" disabled={loading}><span className="cta-plus">＋</span>{loading ? "保存中…" : "保存案例"}</button></>}
    />
    <form id="case-create-form" onSubmit={submit} className="split-view">
      <div className="grid preview-sticky">
        <section className="card">
          <div className="card-head">
            <div><h2>案例证据</h2><div className="card-sub">评审看到的第一份视觉与结构证据</div></div>
            <div className="preview-tabs" role="tablist" aria-label="案例证据类型">
              <button type="button" role="tab" aria-selected={previewTab === "screenshot"} className={"preview-tab " + (previewTab === "screenshot" ? "active" : "")} onClick={() => setPreviewTab("screenshot")}>375px</button>
              <button type="button" role="tab" aria-selected={previewTab === "html"} className={"preview-tab " + (previewTab === "html" ? "active" : "")} onClick={() => setPreviewTab("html")}>HTML</button>
            </div>
          </div>
          {previewTab === "screenshot" ? <div className="evidence-tab-panel">
            <div className={"upload-zone " + (screenshot ? "has-image" : "")}>
              {screenshot ? <img className="preview-image" src={screenshot.dataUrl} alt="案例截图预览" /> : <div className="empty" style={{ minHeight: 280 }}><strong>上传原始截图</strong><div className="small" style={{ marginTop: 6 }}>无需预先裁切；平台会自动识别并适配</div></div>}
              <input className="input" style={{ marginTop: 12 }} type="file" accept={SCREENSHOT_ACCEPT} onChange={async (event) => { const file = event.target.files?.[0]; if (!file) return; setError(null); try { setScreenshot(await readScreenshotFile(file)); } catch (uploadError) { setScreenshot(null); setError(uploadError instanceof Error ? uploadError.message : "无法读取截图"); } }} />
            </div>
            <div className="small muted" style={{ marginTop: 10 }}>{screenshotFitHint(screenshot)}</div>
            {!screenshot ? <div className="small muted" style={{ marginTop: 4 }}>截图是必填项；没有视觉证据的案例不能提交审核。</div> : null}
          </div> : <div className="evidence-tab-panel">
            <textarea className="textarea tall mono html-editor" value={form.html} onChange={(event) => set("html", event.target.value)} aria-label="HTML 证据" />
            <div className="small muted" style={{ marginTop: 10 }}>保存前会清洗脚本、表单和外部资源；预览始终运行在沙箱 iframe 中。</div>
          </div>}
        </section>
      </div>
      <div className="grid">
        <section className="form-section">
          <div className="form-section-head"><div><h3>基本信息</h3><p>定义案例来源，并选择用户真实面对的起稿任务</p></div><span className="form-section-index">01</span></div>
          <div className="form-grid">
            <div className="field full"><label>案例标题</label><input className="input" value={form.title} onChange={(event) => set("title", event.target.value)} placeholder="一句话说明这个案例解决了什么问题" required /></div>
            <div className="field"><label>来源 Brief</label><select className="select" value={form.briefId} onChange={(event) => set("briefId", event.target.value)}><option value="">不关联</option>{briefs.data?.map((brief) => <option key={brief.id} value={brief.id}>{brief.briefNo} · {brief.title}</option>)}</select></div>
            <div className="field"><label>来源类型</label><select className="select" value={form.sourceType} onChange={(event) => set("sourceType", event.target.value)}><option value="INTERNAL_ORIGINAL">内部原创</option><option value="USER_CONTENT">用户内容</option><option value="THIRD_PARTY">第三方</option><option value="PUBLIC_DOMAIN">公共领域</option></select></div>
            <div className="field full">
              <label>用户侧起稿起点 <span className="field-note">1–3 个，首个为主</span></label>
              <div className="choice-list">
                {START_POINTS.map((point) => <label className={"choice-card " + (form.startPoints.includes(point.id) ? "selected" : "")} key={point.id}><input type="checkbox" checked={form.startPoints.includes(point.id)} onChange={() => toggleStartPoint(point.id)} /><span><strong>{point.label}</strong><span className="small muted">{point.description}</span></span></label>)}
              </div>
              <span className="hint">九主型只保留为内部检索兼容，不再要求用户理解或选择。</span>
            </div>
            <div className="field full">
              <label>意图标签 <span className="field-note">可选</span></label>
              <div className="tag-choice-list">{INTENT_TAGS.map((tag) => <label className={"tag-choice " + (form.intentTags.includes(tag.id) ? "selected" : "")} key={tag.id}><input type="checkbox" checked={form.intentTags.includes(tag.id)} onChange={() => toggleIntentTag(tag.id)} />{tag.label}</label>)}</div>
            </div>
          </div>
        </section>
        <section className="form-section">
          <div className="form-section-head"><div><h3>内容与机制</h3><p>说明内容为何需要这个机制，以及正文如何继续兑现它</p></div><span className="form-section-index">02</span></div>
          <div className="form-grid">
            <div className="field full"><label>适用内容条件</label><textarea className="textarea" value={form.applicableConditions} onChange={(event) => set("applicableConditions", event.target.value)} required /><span className="hint">什么内容适合使用这个机制？什么情况下必须放弃？</span></div>
            <div className="field full"><label>设计机制（首屏 / 整体视觉判断）</label><textarea className="textarea" value={form.designMechanism} onChange={(event) => set("designMechanism", event.target.value)} required /></div>
            <div className="field full"><label>正文承接机制</label><textarea className="textarea" value={form.bodyMechanism} onChange={(event) => set("bodyMechanism", event.target.value)} required /><span className="hint">首屏之后，章节如何继续兑现同一机制？不能只描述封面。</span></div>
            <div className="field full"><label>结构签名</label><textarea className="textarea" value={form.structureSignature} onChange={(event) => set("structureSignature", event.target.value)} placeholder="例如：wide-image-entry > narrow-body > image-pause > human-action-close" required /><span className="hint">用至少三个可比较的阅读步骤描述骨架，便于检索与去重。</span></div>
            <div className="field"><label>机制标签</label><input className="input" value={form.mechanismTags} onChange={(event) => set("mechanismTags", event.target.value)} placeholder="摄影拼贴，纸层错位，路线图" /><span className="hint">用逗号分隔</span></div>
            <div className="field"><label>来源说明</label><input className="input" value={form.sourceNote} onChange={(event) => set("sourceNote", event.target.value)} required /></div>
            <div className="field full"><label>反模式（每行一条）</label><textarea className="textarea" value={form.antiPatterns} onChange={(event) => set("antiPatterns", event.target.value)} placeholder="不要把所有图片做成同一矩形&#10;不要让每个章节都加一条细横线" /></div>
          </div>
        </section>
        <section className="form-section">
          <div className="form-section-head"><div><h3>七项视觉语法</h3><p>记录可以迁移到别的内容上的设计规则，不记录案例独有文案或资产</p></div><span className="form-section-index">03</span></div>
          <div className="form-grid">
            {VISUAL_GRAMMAR_FIELDS.map((field) => <div className="field full" key={field.key}><label>{field.label}</label><textarea className="textarea" value={form.visualGrammar[field.key]} onChange={(event) => setVisual(field.key, event.target.value)} required /><span className="hint">{field.hint}</span></div>)}
          </div>
        </section>
        <section className="form-section">
          <div className="form-section-head"><div><h3>六维自评</h3><p>1–5 分；无图时图片叙事可选 N/A</p></div><span className="form-section-index">04</span></div>
          <div className="score-grid">{DIMENSIONS.map((dimension) => <div className="score-field" key={dimension.code}><span>{dimension.label}{dimension.code === "IMAGE_NARRATIVE" ? <span className="hint">（无图可选 N/A）</span> : null}</span><select className="select" value={form.selfScores[dimension.code]} onChange={(event) => set("selfScores", { ...form.selfScores, [dimension.code]: event.target.value })}><option value="N/A">N/A</option>{[1, 2, 3, 4, 5].map((value) => <option key={value} value={value}>{value}</option>)}</select></div>)}</div>
        </section>
        <div className="notice">授权字段默认全部为 false。案例创建后由 Owner / Design Lead 在详情页填写并保存授权证据；字段缺失、未知字段、授权或双评不完整会阻断导出，图像语言和结构签名较弱只显示改进建议。</div>
        {warnings.length ? <div className="notice">可保存的质量建议：{warnings.join("；")}</div> : null}
        {error ? <div className="error-box">{error}</div> : null}
        <div className="form-actions"><div className="small muted">保存后不会覆盖历史版本；修改会生成新版本并重新进入评审。</div><button className="btn primary cta" type="submit" disabled={loading}><span className="cta-plus">＋</span>{loading ? "保存中…" : "保存案例卡并进入详情"}</button></div>
      </div>
    </form>
  </>;
}
