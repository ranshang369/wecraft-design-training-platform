"use client";
import Link from "next/link";
import { use, useEffect, useRef, useState } from "react";
import { api, useApi, formatDate } from "@/lib/client";
import { PageHeader, Badge } from "@/components/ui";
import { HtmlPreview } from "@/components/html-preview";
import { ScoreInputs, ScoreTable, emptyScores, type ScoreValue } from "@/components/scoring";

type Side = "LEFT" | "RIGHT";

function HardChecks({ title, checks }: { title: string; checks: any[] }) {
  return <div className="card" style={{ boxShadow: "none" }}><div className="card-head"><strong>{title} 硬检查</strong><span className="small muted">{checks?.length ?? 0} 项</span></div>{checks?.length ? <div className="grid">{checks.map((check) => <div className="check-row" key={check.ruleId}><Badge value={check.status} /><span style={{ flex: 1 }}>{check.ruleId} · {check.message}</span><span className="small muted">{check.severity}</span></div>)}</div> : <div className="error-box">未找到硬检查结果，不能提交盲测评分。</div>}</div>;
}

export default function BlindRoomPage({ params }: { params: Promise<{ id: string; pairId: string }> }) {
  const { id, pairId } = use(params);
  const query = useApi<any>("/experiments/" + id + "/pairs/" + pairId + "/blind");
  const [activeSide, setActiveSide] = useState<Side>("LEFT");
  const [leftScores, setLeftScores] = useState<ScoreValue>(emptyScores());
  const [rightScores, setRightScores] = useState<ScoreValue>(emptyScores());
  const [preference, setPreference] = useState("LEFT");
  const [rationale, setRationale] = useState("");
  const [confidence, setConfidence] = useState(3);
  const [acknowledged, setAcknowledged] = useState(false);
  const [hardCheckNotes, setHardCheckNotes] = useState("");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const startedAt = useRef(Date.now());

  useEffect(() => {
    const existing = query.data?.existing;
    if (!existing) return;
    setPreference(existing.preference);
    setRationale(existing.rationale);
    setConfidence(existing.confidence);
    setAcknowledged(existing.hardCheckAcknowledged);
    setHardCheckNotes(existing.hardCheckNotes ?? "");
    const left = Object.fromEntries((existing.scores ?? []).filter((row: any) => row.side === "LEFT").map((row: any) => [row.dimensionCode, row.isNa ? null : row.score]));
    const right = Object.fromEntries((existing.scores ?? []).filter((row: any) => row.side === "RIGHT").map((row: any) => [row.dimensionCode, row.isNa ? null : row.score]));
    if (Object.keys(left).length) setLeftScores(left);
    if (Object.keys(right).length) setRightScores(right);
  }, [query.data]);

  if (query.loading) return <div className="loading">准备 A/B 盲测…</div>;
  if (query.error) return <div className="error-box">{query.error}</div>;
  const data = query.data;
  const submitted = Boolean(data?.submitted);
  const active = data?.[activeSide === "LEFT" ? "left" : "right"];
  const hardBlocked = [...(data?.hardChecks?.left ?? []), ...(data?.hardChecks?.right ?? [])].some((check) => check.severity === "BLOCK" && ["FAIL", "ERROR"].includes(check.status));
  const hasChecks = Boolean(data?.hardChecks?.left?.length && data?.hardChecks?.right?.length);

  async function submit(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setMessage(null);
    try {
      const normalize = (value: ScoreValue) => Object.fromEntries(Object.entries(value).map(([key, score]) => [key, score ?? 4]));
      await api("/experiments/" + id + "/pairs/" + pairId + "/blind", { method: "POST", body: JSON.stringify({ scores: { left: normalize(leftScores), right: normalize(rightScores) }, preference, rationale, confidence, durationMs: Date.now() - startedAt.current, hardCheckAcknowledged: acknowledged, hardCheckNotes }) });
      await query.reload();
      setMessage({ ok: true, text: "盲测评分与偏好已提交，提交后不可原地修改。" });
    } catch (error) { setMessage({ ok: false, text: error instanceof Error ? error.message : "提交失败" }); }
    finally { setBusy(false); }
  }

  return <>
    <PageHeader title={(data?.pairNo ?? "盲测") + " · A/B 比较"} description={(data?.brief?.briefNo ?? "") + " · " + (data?.brief?.title ?? "") + " · 模型、来源和上一轮分数已隐藏"} action={<><Link className="btn" href={"/experiments/" + id + "/blind"}>返回房间列表</Link><Badge value={submitted ? "SUBMITTED" : data?.taskStatus} /></>} />
    {message ? <div className={message.ok ? "success-box" : "error-box"} style={{ marginBottom: 14 }}>{message.text}</div> : null}
    {data?.brief?.content ? <section className="card" style={{ marginBottom: 16 }}><div className="card-head"><h2>Brief</h2><span className="small muted">内容与设计委托</span></div><div style={{ whiteSpace: "pre-wrap" }}>{data.brief.content.manuscriptMarkdown}</div><div className="detail-list" style={{ marginTop: 12 }}><div><dt>设计委托</dt><dd>{data.brief.content.designCommission}</dd></div><div><dt>禁止项</dt><dd>{data.brief.content.prohibitedItems}</dd></div></div></section> : null}
    <div className="card" style={{ marginBottom: 16 }}><div className="card-head"><div><h2>375px 证据对照</h2><div className="card-sub">切换 A/B 查看完整截图；HTML 预览只允许沙箱内联样式与 data 图片。</div></div><div className="actions"><button className={"btn " + (activeSide === "LEFT" ? "primary" : "")} onClick={() => setActiveSide("LEFT")}>方案 A</button><button className={"btn " + (activeSide === "RIGHT" ? "primary" : "")} onClick={() => setActiveSide("RIGHT")}>方案 B</button></div></div><div className="split-view"><div>{active?.screenshotFileId ? <img className="preview-image" src={"/api/v1/files/" + active.screenshotFileId + "/content"} alt={(activeSide === "LEFT" ? "方案 A" : "方案 B") + " 375px 截图"} /> : <div className="empty" style={{ minHeight: 300 }}>缺少截图</div>}</div><div><HtmlPreview fileId={active?.htmlFileId} title={(activeSide === "LEFT" ? "方案 A" : "方案 B") + " HTML"} /><div className="small muted" style={{ marginTop: 8 }}>当前查看：{activeSide === "LEFT" ? "方案 A" : "方案 B"} · 内部候选版本匿名化</div></div></div></div>

    <section className="card" style={{ marginBottom: 16 }}><div className="card-head"><div><h2>第一步：核对硬检查</h2><div className="card-sub">平台在隔离渲染器中执行。存在 BLOCK 失败时禁止评分。</div></div><Badge value={hardBlocked ? "HARD_CHECK_FAILED" : hasChecks ? "PASS" : "PENDING"} /></div><div className="split-view"><HardChecks title="方案 A" checks={data?.hardChecks?.left} /><HardChecks title="方案 B" checks={data?.hardChecks?.right} /></div><label className="check-row"><input type="checkbox" checked={acknowledged} disabled={submitted} onChange={(event) => setAcknowledged(event.target.checked)} /><span>我已独立核对双方硬检查结果，并确认没有遗漏阻断项。</span></label><div className="field" style={{ marginTop: 10 }}><label>硬检查备注（可选）</label><input className="input" value={hardCheckNotes} disabled={submitted} onChange={(event) => setHardCheckNotes(event.target.value)} /></div>{hardBlocked ? <div className="error-box" style={{ marginTop: 10 }}>至少一侧存在 BLOCK 硬检查失败，服务端会阻止提交。</div> : null}</section>

    {submitted ? <section className="card"><div className="card-head"><div><h2>已提交</h2><div className="card-sub">提交于实验运行期间，分数和偏好不可直接修改。</div></div><Badge value="SUBMITTED" /></div><div className="grid grid-2"><div><h3>方案 A</h3><ScoreTable scores={(data.existing?.scores ?? []).filter((row: any) => row.side === "LEFT")} /></div><div><h3>方案 B</h3><ScoreTable scores={(data.existing?.scores ?? []).filter((row: any) => row.side === "RIGHT")} /></div></div><div style={{ marginTop: 14 }}><strong>偏好：</strong>{data.existing?.preference === "TIE" ? "平票" : data.existing?.preference === "LEFT" ? "方案 A" : "方案 B"} · <strong>置信度：</strong>{data.existing?.confidence}/5</div><p style={{ marginTop: 8 }}>{data.existing?.rationale}</p></section> : <form className="grid" onSubmit={submit}><section className="card"><div className="card-head"><div><h2>第二步：分别完成六维评分</h2><div className="card-sub">先完成硬检查，再评分；两名评审全部提交前互相看不到分数。</div></div></div><div className="grid grid-2"><div><h3 style={{ marginBottom: 8 }}>方案 A</h3><ScoreInputs value={leftScores} onChange={setLeftScores} allowNa={false} /></div><div><h3 style={{ marginBottom: 8 }}>方案 B</h3><ScoreInputs value={rightScores} onChange={setRightScores} allowNa={false} /></div></div></section><section className="card"><div className="card-head"><h2>第三步：提交偏好</h2></div><div className="form-grid"><div className="field"><label>更优方案</label><select className="select" value={preference} onChange={(event) => setPreference(event.target.value)}><option value="LEFT">方案 A</option><option value="RIGHT">方案 B</option><option value="TIE">平票</option></select></div><div className="field"><label>置信度</label><select className="select" value={confidence} onChange={(event) => setConfidence(Number(event.target.value))}>{[1,2,3,4,5].map((value) => <option key={value} value={value}>{value} / 5</option>)}</select></div><div className="field full"><label>判断理由</label><textarea className="textarea" value={rationale} onChange={(event) => setRationale(event.target.value)} required /></div></div><div className="notice" style={{ marginTop: 12 }}>提交后分数与偏好锁定。模型、来源和上一轮分数不会在此房间显示。</div><button className="btn primary" style={{ marginTop: 12 }} disabled={busy || !acknowledged || !hasChecks || rationale.trim().length < 2}>{busy ? "提交中…" : "提交盲测评分与偏好"}</button></section></form>}
  </>;
}
