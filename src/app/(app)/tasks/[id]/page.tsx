"use client";
import Link from "next/link";
import { use, useEffect, useState } from "react";
import { api, useApi, formatDate } from "@/lib/client";
import { PageHeader, Badge, Empty } from "@/components/ui";
import { HtmlPreview } from "@/components/html-preview";
import { ScoreInputs, ScoreTable, emptyScores, type ScoreValue } from "@/components/scoring";

const RECOMMENDATION_LABELS: Record<string, string> = { PUBLISHABLE: "可发布", NOT_PUBLISHABLE: "不可发布", CHANGES_REQUESTED: "需修改" };
const TYPE_LABELS: Record<string, string> = { CASE_REVIEW: "案例评审", COUNTEREXAMPLE_REVIEW: "反例评审", ARBITRATION: "裁决", BLIND_PAIRWISE: "盲测比较" };

export default function TaskPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const query = useApi<any>("/review-tasks/" + id);
  const [scores, setScores] = useState<ScoreValue>(emptyScores());
  const [recommendation, setRecommendation] = useState("PUBLISHABLE");
  const [rationale, setRationale] = useState("");
  const [evidenceType, setEvidenceType] = useState("SCREENSHOT_REGION");
  const [locator, setLocator] = useState("375px / 标题区");
  const [excerpt, setExcerpt] = useState("");
  const [revisionMode, setRevisionMode] = useState(false);
  const [revisionReason, setRevisionReason] = useState("");
  const [arbitrationPreference, setArbitrationPreference] = useState("LEFT");
  const [arbitrationReason, setArbitrationReason] = useState("");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const review = query.data?.myReview;
    if (!review || revisionMode) return;
    setScores(Object.fromEntries(review.scores.map((row: any) => [row.dimensionCode, row.isNa ? null : row.score])));
    setRecommendation(review.recommendation);
    setRationale(review.rationale ?? "");
    setExcerpt(review.evidence?.[0]?.excerpt ?? "");
    setLocator(review.evidence?.[0]?.locator ?? "375px / 标题区");
    setEvidenceType(review.evidence?.[0]?.evidenceType ?? "SCREENSHOT_REGION");
  }, [query.data, revisionMode]);

  if (query.loading) return <div className="loading">加载评审任务…</div>;
  if (query.error) return <div className="error-box">{query.error}</div>;
  const task = query.data;
  if (!task) return <Empty>任务不存在或你没有访问权限。</Empty>;

  const submitted = task.status === "SUBMITTED" || Boolean(task.myReview);
  const subject = task.case ?? task.counterexample;
  const version = subject?.versions?.[0];
  const currentAssets = (subject?.assets ?? []).filter((asset: any) => asset.caseVersionId === version?.id || asset.counterexampleVersionId === version?.id);
  const screenshot = currentAssets.find((asset: any) => asset.kind === "SCREENSHOT_375");
  const htmlAsset = currentAssets.find((asset: any) => asset.kind === "HTML");
  const briefVersion = subject?.brief?.versions?.[0];

  async function submitReview(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setMessage(null);
    try {
      const payload: any = { recommendation, rationale, scores, evidence: [{ evidenceType, locator, excerpt }] };
      if (submitted) payload.reason = revisionReason;
      await api("/review-tasks/" + id + (submitted ? "/revise" : "/submit"), { method: "POST", body: JSON.stringify(payload) });
      await query.reload();
      setRevisionMode(false);
      setMessage({ ok: true, text: submitted ? "修订已作为新版本提交并写入审计。" : "评审已提交。提交后不能原地覆盖。" });
    } catch (error) { setMessage({ ok: false, text: error instanceof Error ? error.message : "提交失败" }); }
    finally { setBusy(false); }
  }
  async function submitArbitration() {
    setBusy(true); setMessage(null);
    try {
      await api("/review-tasks/" + id + "/arbitrate", { method: "POST", body: JSON.stringify({ preference: arbitrationPreference, reason: arbitrationReason }) });
      await query.reload();
      setMessage({ ok: true, text: "裁决已确认，结果已写入实验记录。" });
    } catch (error) { setMessage({ ok: false, text: error instanceof Error ? error.message : "裁决提交失败" }); }
    finally { setBusy(false); }
  }

  if (task.type === "BLIND_PAIRWISE") {
    return <>
      <PageHeader title="盲测比较任务" description={TYPE_LABELS[task.type] + " · " + task.status} action={<Link className="btn" href="/inbox">返回待办</Link>} />
      <div className="card"><div className="card-head"><h2>进入盲测房间</h2><Badge value={task.status} /></div><p>盲测房间会随机排列 A/B，隐藏模型、来源和上一轮分数。你必须先核对两侧硬检查，再完成六维评分和偏好选择。</p>{task.blind ? <Link className="btn primary" style={{ marginTop: 14 }} href={"/experiments/" + task.blind.experimentId + "/blind/" + task.blind.pairId}>打开 A/B 房间</Link> : null}</div>
    </>;
  }

  if (task.type === "ARBITRATION" && task.arbitration) {
    const arbitration = task.arbitration;
    return <>
      <PageHeader title="盲测结果裁决" description={arbitration.pairNo + " · 盲测来源与模型信息保持隐藏"} action={<Link className="btn" href="/inbox">返回待办</Link>} />
      {message ? <div className={message.ok ? "success-box" : "error-box"} style={{ marginBottom: 14 }}>{message.text}</div> : null}
      <div className="side-by-side">
        <section className="blind-side"><div className="card-head"><h3>方案 A</h3></div>{arbitration.sides.left.screenshotFileId ? <img className="preview-image" src={"/api/v1/files/" + arbitration.sides.left.screenshotFileId + "/content"} alt="方案 A 截图" /> : null}<HtmlPreview fileId={arbitration.sides.left.htmlFileId} title="方案 A" /></section>
        <section className="blind-side"><div className="card-head"><h3>方案 B</h3></div>{arbitration.sides.right.screenshotFileId ? <img className="preview-image" src={"/api/v1/files/" + arbitration.sides.right.screenshotFileId + "/content"} alt="方案 B 截图" /> : null}<HtmlPreview fileId={arbitration.sides.right.htmlFileId} title="方案 B" /></section>
      </div>
      <section className="card" style={{ marginTop: 16 }}><div className="card-head"><h2>评审记录</h2><span className="small muted">偏好已按统一 A/B 方向归一化</span></div><div className="grid">{arbitration.comparisons.map((comparison: any) => <div className="card" key={comparison.reviewerLabel} style={{ boxShadow: "none" }}><div className="card-head"><strong>{comparison.reviewerLabel}</strong><span>{comparison.normalizedPreference === "TIE" ? "平票" : comparison.normalizedPreference === "LEFT" ? "选择 A" : "选择 B"} · 置信度 {comparison.confidence}</span></div><div className="small">{comparison.rationale}</div><ScoreTable scores={comparison.scores} /></div>)}</div></section>
      <section className="card" style={{ marginTop: 16 }}><div className="card-head"><h2>我的确认</h2><Badge value={task.status} /></div>{task.status === "SUBMITTED" ? <div className="success-box">裁决已提交：{arbitration.adjudicatedPreference === "TIE" ? "平票" : arbitration.adjudicatedPreference === "LEFT" ? "方案 A" : "方案 B"} · {arbitration.adjudicationReason}</div> : <><div className="form-grid"><div className="field"><label>裁决结果</label><select className="select" value={arbitrationPreference} onChange={(event) => setArbitrationPreference(event.target.value)}><option value="LEFT">方案 A</option><option value="RIGHT">方案 B</option><option value="TIE">平票</option></select></div><div className="field"><label>裁决理由</label><textarea className="textarea" value={arbitrationReason} onChange={(event) => setArbitrationReason(event.target.value)} /></div></div><button className="btn primary" style={{ marginTop: 12 }} disabled={busy || arbitrationReason.trim().length < 2} onClick={submitArbitration}>确认并写入实验记录</button></>}</section>
    </>;
  }

  if (task.type === "ARBITRATION") {
    return <>
      <PageHeader title="案例分歧裁决" description="请打开案例详情，在裁决区记录结果和理由。" action={<Link className="btn" href="/inbox">返回待办</Link>} />
      <div className="card"><p>该裁决对应案例 {task.subjectId.slice(0, 8)}。</p><Link className="btn primary" style={{ marginTop: 12 }} href={"/cases/" + task.subjectId}>打开案例裁决</Link></div>
    </>;
  }

  return <>
    <PageHeader title={TYPE_LABELS[task.type] ?? "评审任务"} description={(subject?.caseNo ?? subject?.counterexampleNo ?? "") + " · " + (subject?.title ?? "")} action={<><Link className="btn" href="/inbox">返回待办</Link><Badge value={task.status} /></>} />
    {message ? <div className={message.ok ? "success-box" : "error-box"} style={{ marginBottom: 14 }}>{message.text}</div> : null}
    <div className="split-view">
      <div className="grid preview-sticky">
        <section className="card"><div className="card-head"><h2>375px 截图</h2></div>{screenshot ? <img className="preview-image" src={"/api/v1/files/" + screenshot.storedFileId + "/content"} alt="待评审设计截图" /> : <Empty>缺少截图</Empty>}</section>
        <section className="card"><div className="card-head"><h2>HTML 预览</h2><span className="badge green">沙箱</span></div><HtmlPreview fileId={htmlAsset?.storedFileId} /></section>
      </div>
      <div className="grid">
        <section className="card"><div className="card-head"><div><h2>任务信息</h2><div className="card-sub">独立评分。两名评审全部提交前，你看不到对方分数。</div></div><Badge value={task.status} /></div><div className="detail-list"><div><dt>Brief</dt><dd>{subject?.brief ? <Link href={"/briefs/" + subject.brief.id}>{subject.brief.briefNo} · {subject.brief.title}</Link> : "—"}</dd></div><div><dt>设计机制</dt><dd>{version?.designMechanism ?? version?.failureSummary}</dd></div><div><dt>适用条件</dt><dd>{Array.isArray(version?.applicableConditions) ? version.applicableConditions.join("；") : version?.applicableConditions}</dd></div><div><dt>评审提示</dt><dd>{briefVersion?.designCommission}</dd></div></div></section>
        {submitted && task.myReview ? <section className="card"><div className="card-head"><div><h2>已提交评审 · v{task.myReview.version}</h2><div className="card-sub">提交于 {formatDate(task.myReview.submittedAt)}，不可原地覆盖。</div></div><Badge value="SUBMITTED" /></div><div className="small" style={{ marginBottom: 8 }}>{task.myReview.rationale}</div><ScoreTable scores={task.myReview.scores} /><div className="notice" style={{ marginTop: 12 }}>如需修改，必须填写理由并生成新版本。旧版本会保留为 SUPERSEDED。</div>{!revisionMode ? <button className="btn" style={{ marginTop: 12 }} onClick={() => setRevisionMode(true)}>创建评审修订</button> : null}</section> : null}
        {(!submitted || revisionMode) ? <section className="card"><form className="grid" onSubmit={submitReview}><div className="card-head"><div><h2>{revisionMode ? "评审修订" : "提交独立评分"}</h2><div className="card-sub">六维评分、结论、理由和证据均必填。</div></div><Badge value={revisionMode ? "DRAFT" : "ASSIGNED"} /></div><div className="field"><label>可发布结论</label><select className="select" value={recommendation} onChange={(event) => setRecommendation(event.target.value)}>{Object.entries(RECOMMENDATION_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div><div className="field"><label>总体理由</label><textarea className="textarea" value={rationale} onChange={(event) => setRationale(event.target.value)} required /></div><ScoreInputs value={scores} onChange={setScores} /><div className="form-grid"><div className="field"><label>证据类型</label><select className="select" value={evidenceType} onChange={(event) => setEvidenceType(event.target.value)}><option value="SCREENSHOT_REGION">截图区域</option><option value="HTML_FRAGMENT">HTML 片段</option><option value="MANUSCRIPT_EXCERPT">正文摘录</option></select></div><div className="field"><label>定位</label><input className="input" value={locator} onChange={(event) => setLocator(event.target.value)} required /></div><div className="field full"><label>证据说明</label><textarea className="textarea" value={excerpt} onChange={(event) => setExcerpt(event.target.value)} required /></div></div>{revisionMode ? <div className="field"><label>修订理由（写入审计）</label><input className="input" value={revisionReason} onChange={(event) => setRevisionReason(event.target.value)} required /></div> : null}<div className="actions">{revisionMode ? <button className="btn" type="button" onClick={() => setRevisionMode(false)}>取消修订</button> : null}<button className="btn primary" disabled={busy}>{busy ? "提交中…" : revisionMode ? "提交修订版本" : "提交评审"}</button></div></form></section> : null}
      </div>
    </div>
  </>;
}
