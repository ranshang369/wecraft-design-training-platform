"use client";
import Link from "next/link";
import { use, useEffect, useState } from "react";
import { api, useApi, formatDate } from "@/lib/client";
import { PageHeader, Badge, Empty } from "@/components/ui";
import { HtmlPreview } from "@/components/html-preview";
import { ScoreTable } from "@/components/scoring";
import { ARCHETYPES } from "@/lib/constants";

const SOURCE_LABELS: Record<string, string> = { INTERNAL_ORIGINAL: "内部原创", USER_CONTENT: "用户内容", THIRD_PARTY: "第三方", PUBLIC_DOMAIN: "公共领域" };
const AUTH_LABELS: Array<[string, string]> = [
  ["canUseForGeneration", "可生成"],
  ["canUseForDisplay", "可展示"],
  ["canUseForTraining", "可训练"],
  ["canDeriveMechanism", "可提炼机制"],
  ["canUseForEvaluation", "可评测"],
  ["canShowPublicly", "可公开展示"],
];

export default function CaseDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const caseQuery = useApi<any>("/cases/" + id);
  const meQuery = useApi<any>("/auth/me");
  const [form, setForm] = useState<any>(null);
  const [authorization, setAuthorization] = useState<any>(null);
  const [members, setMembers] = useState<any[]>([]);
  const [reviewerIds, setReviewerIds] = useState<string[]>([]);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [resolveOutcome, setResolveOutcome] = useState("ELIGIBLE");
  const [resolveReason, setResolveReason] = useState("");

  const roles: string[] = meQuery.data?.roles ?? [];
  const canEdit = roles.some((role) => ["OWNER", "DESIGN_LEAD", "ANNOTATOR"].includes(role));
  const canApprove = roles.some((role) => ["OWNER", "DESIGN_LEAD"].includes(role));
  const canAuthorize = roles.some((role) => ["OWNER", "DESIGN_LEAD"].includes(role));
  const canAssign = roles.some((role) => ["OWNER", "DESIGN_LEAD", "CONTENT_LEAD"].includes(role));
  const canResolve = roles.some((role) => ["OWNER", "DESIGN_LEAD", "CONTENT_LEAD"].includes(role));

  useEffect(() => {
    const data = caseQuery.data;
    if (!data?.versions?.[0] || form) return;
    const version = data.versions[0];
    setForm({
      title: data.title, archetype: data.archetype, briefId: data.briefId ?? "",
      applicableConditions: version.applicableConditions, designMechanism: version.designMechanism,
      mechanismTags: (version.mechanismTags ?? []).join("，"), antiPatterns: (version.antiPatterns ?? []).join("\n"),
      sourceType: version.sourceType, sourceNote: version.sourceNote, html: "", screenshotDataUrl: "",
    });
    setAuthorization({
      canUseForGeneration: data.authorization?.canUseForGeneration ?? false,
      canUseForDisplay: data.authorization?.canUseForDisplay ?? false,
      canUseForTraining: data.authorization?.canUseForTraining ?? false,
      canDeriveMechanism: data.authorization?.canDeriveMechanism ?? false,
      canUseForEvaluation: data.authorization?.canUseForEvaluation ?? false,
      canShowPublicly: data.authorization?.canShowPublicly ?? false,
      evidenceStatus: data.authorization?.evidenceStatus ?? "MISSING",
      evidenceNote: data.authorization?.evidenceNote ?? "",
      reason: "",
    });
  }, [caseQuery.data, form]);

  if (caseQuery.loading) return <div className="loading">加载案例卡…</div>;
  if (caseQuery.error) return <div className="error-box">{caseQuery.error}</div>;
  const data = caseQuery.data;
  if (!data) return <Empty>案例不存在或你没有权限查看。</Empty>;
  const currentVersion = data.versions?.[0];
  const currentAssets = (data.assets ?? []).filter((asset: any) => asset.caseVersionId === currentVersion?.id);
  const screenshot = currentAssets.find((asset: any) => asset.kind === "SCREENSHOT_375");
  const htmlAsset = currentAssets.find((asset: any) => asset.kind === "HTML");
  const reviews = data.reviews ?? [];

  function set(key: string, value: any) { setForm((current: any) => ({ ...current, [key]: value })); }
  function setAuth(key: string, value: any) { setAuthorization((current: any) => ({ ...current, [key]: value })); }

  async function reload(messageText?: string) {
    await caseQuery.reload();
    setForm(null);
    if (messageText) setMessage({ ok: true, text: messageText });
  }
  async function run(action: () => Promise<unknown>, success: string) {
    setBusy(true); setMessage(null);
    try { await action(); await reload(success); }
    catch (error) { setMessage({ ok: false, text: error instanceof Error ? error.message : "操作失败" }); }
    finally { setBusy(false); }
  }
  async function saveVersion(event: React.FormEvent) {
    event.preventDefault();
    const payload: any = {
      title: form.title, archetype: form.archetype, briefId: form.briefId || null,
      applicableConditions: form.applicableConditions, designMechanism: form.designMechanism,
      mechanismTags: form.mechanismTags.split(/[，,]/).map((value: string) => value.trim()).filter(Boolean),
      antiPatterns: form.antiPatterns.split("\n").map((value: string) => value.trim()).filter(Boolean),
      sourceType: form.sourceType, sourceNote: form.sourceNote,
    };
    if (form.html.trim()) payload.html = form.html;
    if (form.screenshotDataUrl) payload.screenshotDataUrl = form.screenshotDataUrl;
    await run(() => api("/cases/" + id, { method: "PATCH", body: JSON.stringify(payload) }), "已生成新版本，需重新评审后才能再次入库。");
  }
  async function saveAuthorization(event: React.FormEvent) {
    event.preventDefault();
    await run(() => api("/cases/" + id + "/authorization", { method: "PUT", body: JSON.stringify(authorization) }), "授权已更新并记录审计。");
  }
  async function loadMembers() {
    if (members.length) return;
    try { setMembers(await api<any[]>("/members")); }
    catch (error) { setMessage({ ok: false, text: error instanceof Error ? error.message : "无法读取成员" }); }
  }
  async function assign() {
    await run(() => api("/cases/" + id + "/assign", { method: "POST", body: JSON.stringify({ reviewerIds }) }), "已分配两名独立评审。");
  }
  async function fileToDataUrl(file: File) {
    return new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = reject; reader.readAsDataURL(file); });
  }

  return <>
    <PageHeader
      title={data.title}
      description={data.caseNo + " · 当前 v" + data.currentVersion + " · " + (ARCHETYPES.find((item) => item.code === data.archetype)?.label ?? data.archetype)}
      action={<><Link className="btn" href="/cases">返回案例库</Link><Badge value={data.status} /><span className="badge gray">{reviews.length} 条可见评审</span></>}
    />
    {message ? <div className={message.ok ? "success-box" : "error-box"} style={{ marginBottom: 14 }}>{message.text}</div> : null}
    <div className="split-view">
      <div className="grid preview-sticky">
        <section className="card">
          <div className="card-head"><h2>375px 截图</h2><span className="small muted">{screenshot?.width ?? 375} × {screenshot?.height ?? "—"}</span></div>
          {screenshot ? <img className="preview-image" src={"/api/v1/files/" + screenshot.storedFileId + "/content"} alt={screenshot.altText ?? data.title + " 截图"} /> : <div className="empty" style={{ minHeight: 300 }}>当前版本缺少截图</div>}
        </section>
        <section className="card">
          <div className="card-head"><h2>HTML 证据</h2><span className="badge green">沙箱预览</span></div>
          <HtmlPreview fileId={htmlAsset?.storedFileId} title={data.title + " HTML 预览"} />
          <div className="small muted" style={{ marginTop: 8 }}>iframe sandbox 不带 allow-scripts；CSP 禁止脚本、表单和外部网络请求。</div>
        </section>
      </div>
      <div className="grid">
        <section className="card">
          <div className="card-head"><div><h2>案例卡</h2><div className="card-sub">左侧证据，右侧结构化字段。审批后修改会生成新版本并重新进入评审。</div></div><Badge value={data.status} /></div>
          <div className="detail-list">
            <div><dt>关联 Brief</dt><dd>{data.brief ? <Link className="mono" href={"/briefs/" + data.brief.id}>{data.brief.briefNo}</Link> : "未关联"}{data.brief?.split === "HOLDOUT" ? <span className="badge amber" style={{ marginLeft: 8 }}>HOLDOUT</span> : null}</dd></div>
            <div><dt>适用内容条件</dt><dd>{currentVersion?.applicableConditions}</dd></div>
            <div><dt>设计机制</dt><dd>{currentVersion?.designMechanism}</dd></div>
            <div><dt>机制标签</dt><dd>{(currentVersion?.mechanismTags ?? []).join(" · ") || "—"}</dd></div>
            <div><dt>反模式</dt><dd>{(currentVersion?.antiPatterns ?? []).length ? (currentVersion?.antiPatterns ?? []).map((value: string) => <div key={value}>· {value}</div>) : "—"}</dd></div>
            <div><dt>来源</dt><dd>{SOURCE_LABELS[currentVersion?.sourceType] ?? currentVersion?.sourceType}<div className="small muted">{currentVersion?.sourceNote}</div></dd></div>
            <div><dt>自评</dt><dd><ScoreTable scores={Object.entries(currentVersion?.selfScores ?? {}).map(([dimensionCode, score]) => ({ dimensionCode, score: Number(score), isNa: false }))} /></dd></div>
          </div>
          <div className="actions" style={{ marginTop: 14 }}>
            {canEdit && ["DRAFT", "CHANGES_REQUESTED", "SUBMITTED"].includes(data.status) ? <button className="btn primary" disabled={busy} onClick={() => run(() => api("/cases/" + id + "/submit", { method: "POST" }), "案例已提交，等待分配评审。")}>提交案例</button> : null}
            {canApprove && ["IN_REVIEW", "SUBMITTED"].includes(data.status) ? <button className="btn" disabled={busy} onClick={() => run(() => api("/cases/" + id + "/approve", { method: "POST" }), "案例已进入 ELIGIBLE。")}>批准入库</button> : null}
          </div>
        </section>

        <section className="card">
          <div className="card-head"><div><h2>授权台账</h2><div className="card-sub">六项授权默认 false；只有 Owner / Design Lead 可修改。</div></div><Badge value={authorization?.evidenceStatus} /></div>
          <form className="grid" onSubmit={saveAuthorization}>
            <div className="grid grid-2">{AUTH_LABELS.map(([key, label]) => <label className="check-row" key={key}><input type="checkbox" checked={Boolean(authorization?.[key])} disabled={!canAuthorize} onChange={(event) => setAuth(key, event.target.checked)} /><span>{label}</span></label>)}</div>
            <div className="form-grid">
              <div className="field"><label>证据状态</label><select className="select" value={authorization?.evidenceStatus} disabled={!canAuthorize} onChange={(event) => setAuth("evidenceStatus", event.target.value)}><option value="MISSING">缺失</option><option value="PENDING">待核验</option><option value="VERIFIED">已核验</option><option value="REJECTED">已拒绝</option><option value="EXPIRED">已过期</option><option value="REVOKED">已撤销</option></select></div>
              <div className="field"><label>证据说明</label><input className="input" value={authorization?.evidenceNote ?? ""} disabled={!canAuthorize} onChange={(event) => setAuth("evidenceNote", event.target.value)} /></div>
              <div className="field full"><label>变更理由（必填，写入审计）</label><input className="input" value={authorization?.reason ?? ""} disabled={!canAuthorize} onChange={(event) => setAuth("reason", event.target.value)} required={canAuthorize} minLength={2} /></div>
            </div>
            <div className="small muted">最后更新：{formatDate(data.authorization?.updatedAt)} · 成员变更记录保存在 AuthorizationEvent 与 AuditLog。</div>
            {canAuthorize ? <button className="btn primary" disabled={busy}>保存授权</button> : <div className="notice">你没有修改训练授权的权限，只能查看。</div>}
          </form>
        </section>

        {canAssign ? <section className="card">
          <div className="card-head"><div><h2>分配独立评审</h2><div className="card-sub">至少两人，作者不能评审自己的案例。Holdout Brief 会被服务端阻止。</div></div></div>
          {reviewerIds.length < 2 ? <button className="btn small" onClick={loadMembers}>加载成员</button> : null}
          <div className="grid" style={{ marginTop: 10 }}>{members.map((member) => <label className="check-row" key={member.id}><input type="checkbox" checked={reviewerIds.includes(member.user.id)} onChange={(event) => setReviewerIds((current) => event.target.checked ? [...current.filter((value) => value !== member.user.id), member.user.id] : current.filter((value) => value !== member.user.id))} /><span>{member.user.name} · {member.user.email} · {member.roles.map((row: any) => row.role.name).join(" / ")}</span></label>)}</div>
          <button className="btn primary" style={{ marginTop: 12 }} disabled={busy || reviewerIds.length < 2} onClick={assign}>分配 {reviewerIds.length} 名评审</button>
        </section> : null}

        <section className="card">
          <div className="card-head"><div><h2>评审记录</h2><div className="card-sub">两名评审全部提交前，非管理角色只能看到自己的评分。</div></div><span className="small muted">{reviews.length} 条</span></div>
          {reviews.length ? <div className="grid">{reviews.map((review: any) => <div className="card" key={review.id} style={{ boxShadow: "none" }}><div className="card-head"><strong>v{review.version} · {review.recommendation}</strong><Badge value={review.status} /></div><div className="small" style={{ marginBottom: 8 }}>{review.rationale}</div><ScoreTable scores={review.scores} /><div className="small muted" style={{ marginTop: 8 }}>{review.evidence?.map((row: any) => row.excerpt).join("；")}</div></div>)}</div> : <Empty>尚无可见评审。第一位评审提交前不会显示分数。</Empty>}
        </section>

        {data.status === "ARBITRATION" && canResolve ? <section className="card">
          <div className="card-head"><h2>分歧裁决</h2><Badge value="ARBITRATION" /></div>
          <div className="form-grid"><div className="field"><label>裁决结果</label><select className="select" value={resolveOutcome} onChange={(event) => setResolveOutcome(event.target.value)}><option value="ELIGIBLE">进入 ELIGIBLE</option><option value="CHANGES_REQUESTED">退回修改</option><option value="REJECTED">拒绝</option></select></div><div className="field"><label>裁决理由</label><input className="input" value={resolveReason} onChange={(event) => setResolveReason(event.target.value)} /></div></div>
          <button className="btn primary" style={{ marginTop: 12 }} disabled={busy || resolveReason.trim().length < 2} onClick={() => run(() => api("/cases/" + id + "/resolve", { method: "POST", body: JSON.stringify({ outcome: resolveOutcome, reason: resolveReason }) }), "裁决结果已记录。")}>提交裁决</button>
        </section> : null}

        {canEdit ? <section className="card">
          <div className="card-head"><div><h2>编辑案例卡 · 生成新版本</h2><div className="card-sub">不覆盖 v{data.currentVersion}；新版本需重新评审。</div></div></div>
          {form ? <form className="grid" onSubmit={saveVersion}>
            <div className="form-grid">
              <div className="field full"><label>标题</label><input className="input" value={form.title} onChange={(event) => set("title", event.target.value)} required /></div>
              <div className="field"><label>主型</label><select className="select" value={form.archetype} onChange={(event) => set("archetype", event.target.value)}>{ARCHETYPES.map((item) => <option key={item.code} value={item.code}>{item.label}</option>)}</select></div>
              <div className="field"><label>来源类型</label><select className="select" value={form.sourceType} onChange={(event) => set("sourceType", event.target.value)}>{Object.entries(SOURCE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
              <div className="field full"><label>适用内容条件</label><textarea className="textarea" value={form.applicableConditions} onChange={(event) => set("applicableConditions", event.target.value)} required /></div>
              <div className="field full"><label>设计机制</label><textarea className="textarea" value={form.designMechanism} onChange={(event) => set("designMechanism", event.target.value)} required /></div>
              <div className="field"><label>机制标签</label><input className="input" value={form.mechanismTags} onChange={(event) => set("mechanismTags", event.target.value)} /></div>
              <div className="field"><label>来源说明</label><input className="input" value={form.sourceNote} onChange={(event) => set("sourceNote", event.target.value)} required /></div>
              <div className="field full"><label>反模式（每行一条）</label><textarea className="textarea" value={form.antiPatterns} onChange={(event) => set("antiPatterns", event.target.value)} /></div>
              <div className="field full"><label>替换 HTML（留空则沿用当前证据）</label><textarea className="textarea mono" value={form.html} onChange={(event) => set("html", event.target.value)} /></div>
              <div className="field full"><label>替换 375px 截图（留空则沿用）</label><input className="input" type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" onChange={async (event) => { const file = event.target.files?.[0]; if (file) set("screenshotDataUrl", await fileToDataUrl(file)); }} /></div>
            </div>
            <button className="btn primary" disabled={busy}>保存为新版本</button>
          </form> : null}
        </section> : null}

        <section className="card"><div className="card-head"><h2>版本历史</h2><span className="small muted">不可变快照</span></div><div className="timeline">{data.versions.map((version: any) => <div className="timeline-item" key={version.id}><div className="small muted">v{version.version} · {formatDate(version.createdAt)}</div><div><div>{version.designMechanism}</div><div className="mono small muted">{version.contentHash.slice(0, 24)}…</div></div></div>)}</div></section>
      </div>
    </div>
  </>;
}
