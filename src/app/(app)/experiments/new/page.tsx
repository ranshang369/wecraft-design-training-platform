"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { api, useApi, formatDate } from "@/lib/client";
import { PageHeader, Badge, Empty } from "@/components/ui";

export default function NewExperimentPage() {
  const router = useRouter();
  const briefs = useApi<any[]>("/briefs");
  const candidates = useApi<any[]>("/candidates");
  const members = useApi<any[]>("/members");
  const [form, setForm] = useState({ name: "", briefId: "", leftId: "", rightId: "", reviewerA: "", reviewerB: "", adjudicatorId: "" });
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const briefCandidates = useMemo(() => (candidates.data ?? []).filter((candidate) => candidate.briefId === form.briefId), [candidates.data, form.briefId]);
  const readyCandidates = briefCandidates.filter((candidate) => candidate.status === "READY_FOR_BLIND");
  function set(key: string, value: string) { setForm((current) => ({ ...current, [key]: value })); }
  async function submit(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setMessage(null);
    try {
      const result: any = await api("/experiments", { method: "POST", body: JSON.stringify({ name: form.name, briefId: form.briefId, candidateIds: [form.leftId, form.rightId], reviewerIds: [form.reviewerA, form.reviewerB], adjudicatorId: form.adjudicatorId }) });
      router.push("/experiments/" + result.id);
    } catch (error) { setMessage(error instanceof Error ? error.message : "创建失败"); }
    finally { setBusy(false); }
  }
  if (briefs.loading || candidates.loading || members.loading) return <div className="loading">加载实验素材…</div>;
  if (briefs.error || candidates.error || members.error) return <div className="error-box">{briefs.error ?? candidates.error ?? members.error}</div>;
  return <>
    <PageHeader title="创建盲测实验" description="只允许选择同一 Brief 下、已通过硬检查并进入 READY_FOR_BLIND 的两个候选。Holdout Brief 不得进入普通实验。" action={<Link className="btn" href="/experiments">返回实验</Link>} />
    <form className="card grid" onSubmit={submit}>
      <div className="form-grid">
        <div className="field full"><label>实验名称</label><input className="input" value={form.name} onChange={(event) => set("name", event.target.value)} required /></div>
        <div className="field full"><label>Brief</label><select className="select" value={form.briefId} onChange={(event) => { set("briefId", event.target.value); set("leftId", ""); set("rightId", ""); }} required><option value="">选择 Brief</option>{briefs.data?.filter((brief) => brief.split !== "HOLDOUT").map((brief) => <option key={brief.id} value={brief.id}>{brief.briefNo} · {brief.title}</option>)}</select></div>
        <div className="field"><label>候选 A</label><select className="select" value={form.leftId} onChange={(event) => set("leftId", event.target.value)} required><option value="">选择候选</option>{readyCandidates.filter((candidate) => candidate.id !== form.rightId).map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.candidateNo} · {candidate.title}</option>)}</select></div>
        <div className="field"><label>候选 B</label><select className="select" value={form.rightId} onChange={(event) => set("rightId", event.target.value)} required><option value="">选择候选</option>{readyCandidates.filter((candidate) => candidate.id !== form.leftId).map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.candidateNo} · {candidate.title}</option>)}</select></div>
        <div className="field"><label>评审 A</label><select className="select" value={form.reviewerA} onChange={(event) => set("reviewerA", event.target.value)} required><option value="">选择成员</option>{members.data?.map((member) => <option key={member.id} value={member.user.id}>{member.user.name} · {member.roles.map((row: any) => row.role.name).join("/")}</option>)}</select></div>
        <div className="field"><label>评审 B</label><select className="select" value={form.reviewerB} onChange={(event) => set("reviewerB", event.target.value)} required><option value="">选择成员</option>{members.data?.map((member) => <option key={member.id} value={member.user.id}>{member.user.name} · {member.roles.map((row: any) => row.role.name).join("/")}</option>)}</select></div>
        <div className="field full"><label>裁决人</label><select className="select" value={form.adjudicatorId} onChange={(event) => set("adjudicatorId", event.target.value)} required><option value="">选择裁决人</option>{members.data?.map((member) => <option key={member.id} value={member.user.id}>{member.user.name} · {member.roles.map((row: any) => row.role.name).join("/")}</option>)}</select></div>
      </div>
      {form.briefId && readyCandidates.length < 2 ? <div className="notice">该 Brief 下目前只有 {readyCandidates.length} 个 READY_FOR_BLIND 候选。请先在候选详情运行硬检查。</div> : null}
      <div className="card" style={{ boxShadow: "none" }}><div className="card-head"><h3>候选检查状态</h3></div>{briefCandidates.length ? briefCandidates.map((candidate) => <div className="check-row" key={candidate.id}><Badge value={candidate.status} /><span style={{ flex: 1 }}>{candidate.candidateNo} · {candidate.title}</span><span className="small muted">v{candidate.currentVersion} · {formatDate(candidate.updatedAt)}</span></div>) : <Empty>选择 Brief 后查看候选。</Empty>}</div>
      {message ? <div className="error-box">{message}</div> : null}
      <button className="btn primary" disabled={busy || readyCandidates.length < 2}>{busy ? "创建中…" : "创建实验并进入盲测"}</button>
    </form>
  </>;
}
