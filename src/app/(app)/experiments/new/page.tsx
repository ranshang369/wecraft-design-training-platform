"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { api, useApi, formatDate } from "@/lib/client";
import { PageHeader, Badge, Empty } from "@/components/ui";

type Member = { id: string; user: { id: string; name: string; email: string }; roles: Array<{ role: { name: string } }> };

export default function NewExperimentPage() {
  const router = useRouter();
  const me = useApi<any>("/auth/me");
  const briefs = useApi<any[]>("/briefs");
  const candidates = useApi<any[]>("/candidates");
  const members = useApi<Member[]>("/members");
  const [form, setForm] = useState({ name: "", briefId: "", leftId: "", rightId: "", reviewerA: "", reviewerB: "", reviewerC: "", adjudicatorId: "" });
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const briefCandidates = useMemo(() => (candidates.data ?? []).filter((candidate) => candidate.briefId === form.briefId), [candidates.data, form.briefId]);
  const readyCandidates = briefCandidates.filter((candidate) => candidate.status === "READY_FOR_BLIND");
  const selectedBrief = briefs.data?.find((brief) => brief.id === form.briefId);
  const protocolType = selectedBrief?.split === "HOLDOUT" ? "HOLDOUT" : "DEV";
  const reviewerIds = [form.reviewerA, form.reviewerB, form.reviewerC].filter(Boolean);
  const duplicateReviewer = new Set(reviewerIds).size !== reviewerIds.length;
  const adjudicatorConflict = Boolean(form.adjudicatorId) && reviewerIds.includes(form.adjudicatorId);
  const canCreateHoldout = (me.data?.roles ?? []).some((role: string) => ["OWNER", "ADMIN"].includes(role));
  function set(key: string, value: string) { setForm((current) => ({ ...current, [key]: value })); }
  function memberOptions(excluded: string[]) {
    return members.data?.filter((member) => !excluded.includes(member.user.id)).map((member) => <option key={member.id} value={member.user.id}>{member.user.name} · {member.roles.map((row) => row.role.name).join("/")}</option>);
  }
  async function submit(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setMessage(null);
    try {
      const result: any = await api("/experiments", { method: "POST", body: JSON.stringify({ name: form.name, briefId: form.briefId, candidateIds: [form.leftId, form.rightId], reviewerIds, adjudicatorId: form.adjudicatorId, protocolType }) });
      router.push("/experiments/" + result.id);
    } catch (error) { setMessage(error instanceof Error ? error.message : "创建失败"); }
    finally { setBusy(false); }
  }
  if (me.loading || briefs.loading || candidates.loading || members.loading) return <div className="loading">加载实验素材…</div>;
  if (me.error || briefs.error || candidates.error || members.error) return <div className="error-box">{me.error ?? briefs.error ?? candidates.error ?? members.error}</div>;
  return <>
    <PageHeader title="创建盲测实验" description="选择同一 Brief 下已通过硬检查的两个候选，配置 2–3 名独立评审与 1 名不兼任评审的裁决人。Holdout 实验仅对 Owner/Admin 开放。" action={<Link className="btn" href="/experiments">返回实验</Link>} />
    <form className="card grid" onSubmit={submit}>
      <div className="form-grid">
        <div className="field full"><label>实验名称</label><input className="input" value={form.name} onChange={(event) => set("name", event.target.value)} required /></div>
        <div className="field full"><label>Brief</label><select className="select" value={form.briefId} onChange={(event) => { set("briefId", event.target.value); set("leftId", ""); set("rightId", ""); }} required><option value="">选择 Brief</option>{briefs.data?.map((brief) => <option key={brief.id} value={brief.id}>{brief.briefNo} · {brief.title}{brief.split === "HOLDOUT" ? " · HOLDOUT" : ""}</option>)}</select></div>
        <div className="field full"><label>实验类型</label><div className="check-row"><Badge value={protocolType} /><span className="small muted">{protocolType === "HOLDOUT" ? "保留集评测：匿名 pair 访问按评审任务隔离，结果仅 Owner/Admin 可读。" : "开发集实验：用于迭代方向与评审一致性验证。"}</span></div></div>
        <div className="field"><label>候选 A</label><select className="select" value={form.leftId} onChange={(event) => set("leftId", event.target.value)} required><option value="">选择候选</option>{readyCandidates.filter((candidate) => candidate.id !== form.rightId).map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.candidateNo} · {candidate.title}</option>)}</select></div>
        <div className="field"><label>候选 B</label><select className="select" value={form.rightId} onChange={(event) => set("rightId", event.target.value)} required><option value="">选择候选</option>{readyCandidates.filter((candidate) => candidate.id !== form.leftId).map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.candidateNo} · {candidate.title}</option>)}</select></div>
        <div className="field"><label>独立评审 A</label><select className="select" value={form.reviewerA} onChange={(event) => set("reviewerA", event.target.value)} required><option value="">选择成员</option>{memberOptions([form.reviewerB, form.reviewerC, form.adjudicatorId])}</select></div>
        <div className="field"><label>独立评审 B</label><select className="select" value={form.reviewerB} onChange={(event) => set("reviewerB", event.target.value)} required><option value="">选择成员</option>{memberOptions([form.reviewerA, form.reviewerC, form.adjudicatorId])}</select></div>
        <div className="field"><label>独立评审 C（可选）</label><select className="select" value={form.reviewerC} onChange={(event) => set("reviewerC", event.target.value)}><option value="">两人评审</option>{memberOptions([form.reviewerA, form.reviewerB, form.adjudicatorId])}</select></div>
        <div className="field"><label>裁决人</label><select className="select" value={form.adjudicatorId} onChange={(event) => set("adjudicatorId", event.target.value)} required><option value="">选择裁决人</option>{memberOptions(reviewerIds)}</select></div>
      </div>
      {protocolType === "HOLDOUT" && !canCreateHoldout ? <div className="error-box">当前账号不能创建 Holdout 实验。</div> : null}
      {form.briefId && readyCandidates.length < 2 ? <div className="notice">该 Brief 下目前只有 {readyCandidates.length} 个 READY_FOR_BLIND 候选。请先在候选详情运行硬检查。</div> : null}
      {duplicateReviewer ? <div className="error-box">同一成员不能重复担任评审。</div> : null}
      {adjudicatorConflict ? <div className="error-box">裁决人不能同时担任该实验的评审。</div> : null}
      <div className="notice">达到所配置的评审人数后，系统才自动生成裁决任务；盲测期间模型、来源、上一轮分数与他人的评分始终隐藏。</div>
      <div className="card" style={{ boxShadow: "none" }}><div className="card-head"><h3>候选检查状态</h3></div>{briefCandidates.length ? briefCandidates.map((candidate) => <div className="check-row" key={candidate.id}><Badge value={candidate.status} /><span style={{ flex: 1 }}>{candidate.candidateNo} · {candidate.title}</span><span className="small muted">v{candidate.currentVersion} · {formatDate(candidate.updatedAt)}</span></div>) : <Empty>选择 Brief 后查看候选。</Empty>}</div>
      {message ? <div className="error-box">{message}</div> : null}
      <button className="btn primary" disabled={busy || readyCandidates.length < 2 || duplicateReviewer || adjudicatorConflict || (protocolType === "HOLDOUT" && !canCreateHoldout)}>{busy ? "创建中…" : "创建实验并进入盲测"}</button>
    </form>
  </>;
}
