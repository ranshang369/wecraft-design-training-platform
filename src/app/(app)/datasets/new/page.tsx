"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api, useApi } from "@/lib/client";
import { PageHeader, Badge, Empty } from "@/components/ui";

export default function NewDatasetPage() {
  const router = useRouter();
  const briefs = useApi<any[]>("/briefs");
  const cases = useApi<any[]>("/cases");
  const counterexamples = useApi<any[]>("/counterexamples");
  const candidates = useApi<any[]>("/candidates");
  const [name, setName] = useState("");
  const [type, setType] = useState("TRAIN");
  const [caseIds, setCaseIds] = useState<string[]>([]);
  const [briefIds, setBriefIds] = useState<string[]>([]);
  const [counterexampleIds, setCounterexampleIds] = useState<string[]>([]);
  const [candidateIds, setCandidateIds] = useState<string[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  function toggle(list: string[], setList: (value: string[]) => void, id: string) { setList(list.includes(id) ? list.filter((value) => value !== id) : [...list, id]); }
  async function submit(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setMessage(null);
    try { const result: any = await api("/datasets", { method: "POST", body: JSON.stringify({ name, type, caseIds, briefIds, counterexampleIds, candidateIds }) }); router.push("/datasets/" + result.id); }
    catch (error) { setMessage(error instanceof Error ? error.message : "创建失败"); }
    finally { setBusy(false); }
  }
  if (briefs.loading || cases.loading || counterexamples.loading || candidates.loading) return <div className="loading">加载可导出对象…</div>;
  if (briefs.error || cases.error || counterexamples.error || candidates.error) return <div className="error-box">{briefs.error ?? cases.error ?? counterexamples.error ?? candidates.error}</div>;
  return <>
    <PageHeader title="创建数据集" description="先选条目，再在详情页执行授权与资格校验。校验通过后由 Owner/Design Lead 批准冻结。" action={<Link className="btn" href="/datasets">返回数据集</Link>} />
    <form className="grid" onSubmit={submit}>
      <section className="card"><div className="form-grid"><div className="field"><label>数据集名称</label><input className="input" value={name} onChange={(event) => setName(event.target.value)} required /></div><div className="field"><label>类型</label><select className="select" value={type} onChange={(event) => setType(event.target.value)}><option value="TRAIN">训练集</option><option value="EVAL">评测集</option></select></div></div><div className="notice" style={{ marginTop: 12 }}>训练集要求 canUseForTraining=true；评测集要求 canUseForEvaluation=true。Holdout 不得进入训练集。</div></section>
      <div className="grid grid-2">
        <section className="card"><div className="card-head"><h2>优质案例</h2><span className="small muted">已选 {caseIds.length}</span></div>{cases.data?.length ? cases.data.map((row) => <label className="check-row" key={row.id}><input type="checkbox" checked={caseIds.includes(row.id)} onChange={() => toggle(caseIds, setCaseIds, row.id)} /><span style={{ flex: 1 }}><strong>{row.caseNo}</strong> · {row.title}</span><Badge value={row.status} /></label>) : <Empty>没有案例</Empty>}</section>
        <section className="card"><div className="card-head"><h2>Brief</h2><span className="small muted">已选 {briefIds.length}</span></div>{briefs.data?.length ? briefs.data.map((row) => <label className="check-row" key={row.id}><input type="checkbox" checked={briefIds.includes(row.id)} onChange={() => toggle(briefIds, setBriefIds, row.id)} /><span style={{ flex: 1 }}><strong>{row.briefNo}</strong> · {row.title}</span><Badge value={row.split} /></label>) : <Empty>没有 Brief</Empty>}</section>
        <section className="card"><div className="card-head"><h2>反例</h2><span className="small muted">已选 {counterexampleIds.length}</span></div>{counterexamples.data?.length ? counterexamples.data.map((row) => <label className="check-row" key={row.id}><input type="checkbox" checked={counterexampleIds.includes(row.id)} onChange={() => toggle(counterexampleIds, setCounterexampleIds, row.id)} /><span style={{ flex: 1 }}><strong>{row.counterexampleNo}</strong> · {row.title}</span><Badge value={row.status} /></label>) : <Empty>没有反例</Empty>}</section>
        <section className="card"><div className="card-head"><h2>候选设计</h2><span className="small muted">已选 {candidateIds.length}</span></div>{candidates.data?.length ? candidates.data.map((row) => <label className="check-row" key={row.id}><input type="checkbox" checked={candidateIds.includes(row.id)} onChange={() => toggle(candidateIds, setCandidateIds, row.id)} /><span style={{ flex: 1 }}><strong>{row.candidateNo}</strong> · {row.title}</span><Badge value={row.status} /></label>) : <Empty>没有候选</Empty>}</section>
      </div>
      {message ? <div className="error-box">{message}</div> : null}
      <div className="actions"><button className="btn primary" disabled={busy || caseIds.length + briefIds.length + counterexampleIds.length + candidateIds.length === 0}>{busy ? "创建中…" : "创建数据集并进入校验"}</button></div>
    </form>
  </>;
}
