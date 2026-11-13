"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api, useApi } from "@/lib/client";
import { PageHeader, Badge, Empty } from "@/components/ui";

function SelectionHeader({ title, count, allSelected, onToggleAll }: { title: string; count: number; allSelected: boolean; onToggleAll: () => void }) {
  return <div className="selection-head">
    <h2>{title}</h2>
    <div className="selection-head-actions"><span className="selection-count">已选 {count}</span><button className="btn small" type="button" onClick={onToggleAll} disabled={count === 0 && !allSelected}>{allSelected ? "清空" : "全选"}</button></div>
  </div>;
}

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
  const total = caseIds.length + briefIds.length + counterexampleIds.length + candidateIds.length;
  const stepOneDone = Boolean(name.trim());
  const stepTwoDone = total > 0;
  function toggle(list: string[], setList: (value: string[]) => void, id: string) { setList(list.includes(id) ? list.filter((value) => value !== id) : [...list, id]); }
  function toggleAll(ids: string[], selected: string[], setSelected: (value: string[]) => void) { const allSelected = ids.length > 0 && ids.every((id) => selected.includes(id)); setSelected(allSelected ? [] : ids); }
  async function submit(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setMessage(null);
    try { const result: any = await api("/datasets", { method: "POST", body: JSON.stringify({ name, type, caseIds, briefIds, counterexampleIds, candidateIds }) }); router.push("/datasets/" + result.id); }
    catch (error) { setMessage(error instanceof Error ? error.message : "创建失败"); }
    finally { setBusy(false); }
  }
  if (briefs.loading || cases.loading || counterexamples.loading || candidates.loading) return <div className="loading">加载可导出对象…</div>;
  if (briefs.error || cases.error || counterexamples.error || candidates.error) return <div className="error-box">{briefs.error ?? cases.error ?? counterexamples.error ?? candidates.error}</div>;
  return <>
    <PageHeader title="创建数据集" description="先命名并选择对象，系统随后校验授权与资格。批准并冻结版本后，才能导出。" action={<><Link className="btn" href="/datasets">返回数据集</Link><button className="btn primary cta" type="submit" form="dataset-create-form" disabled={busy || !stepOneDone || total === 0}><span className="cta-plus">＋</span>{busy ? "创建中…" : "创建并校验"}</button></>} />
    <div className="builder-steps" aria-label="数据集创建步骤">
      <div className={"builder-step " + (stepOneDone ? "done" : "active")}><span>{stepOneDone ? "✓" : "01"}</span><div><strong>基础信息</strong><small>命名数据集并选择类型</small></div></div>
      <div className={"builder-step " + (stepTwoDone ? "done" : stepOneDone ? "active" : "")}><span>{stepTwoDone ? "✓" : "02"}</span><div><strong>选择对象</strong><small>案例、Brief、反例与候选</small></div></div>
      <div className={"builder-step " + (stepTwoDone ? "active" : "")}><span>03</span><div><strong>校验并冻结</strong><small>授权完整后生成版本快照</small></div></div>
    </div>
    <form id="dataset-create-form" className="grid" onSubmit={submit}>
      <section className="card">
        <div className="form-grid">
          <div className="field"><label>数据集名称</label><input className="input" value={name} onChange={(event) => setName(event.target.value)} placeholder="例如：设计机制训练集 · 2026-11" required /></div>
          <div className="field"><label>类型</label><select className="select" value={type} onChange={(event) => setType(event.target.value)}><option value="TRAIN">训练集</option><option value="EVAL">评测集</option></select></div>
        </div>
        <div className="notice" style={{ marginTop: 14 }}>训练集要求可训练授权；评测集要求可评测授权。Holdout 不得进入训练集。</div>
      </section>
      <div className="dataset-summary card">
        <div><span>已选条目</span><strong>{total}</strong></div>
        <div><span>优质案例</span><strong>{caseIds.length}</strong></div>
        <div><span>Brief</span><strong>{briefIds.length}</strong></div>
        <div><span>反例</span><strong>{counterexampleIds.length}</strong></div>
        <div><span>候选</span><strong>{candidateIds.length}</strong></div>
      </div>
      <div className="grid grid-2">
        <section className="card selection-card"><SelectionHeader title="优质案例" count={caseIds.length} allSelected={(cases.data?.length ?? 0) > 0 && (cases.data ?? []).every((row) => caseIds.includes(row.id))} onToggleAll={() => toggleAll((cases.data ?? []).map((row) => row.id), caseIds, setCaseIds)} />{cases.data?.length ? cases.data.map((row) => <label className="check-row" key={row.id}><input type="checkbox" checked={caseIds.includes(row.id)} onChange={() => toggle(caseIds, setCaseIds, row.id)} /><span style={{ flex: 1 }}><strong>{row.caseNo}</strong> · {row.title}</span><Badge value={row.status} /></label>) : <Empty>没有案例</Empty>}</section>
        <section className="card selection-card"><SelectionHeader title="Brief" count={briefIds.length} allSelected={(briefs.data?.length ?? 0) > 0 && (briefs.data ?? []).every((row) => briefIds.includes(row.id))} onToggleAll={() => toggleAll((briefs.data ?? []).map((row) => row.id), briefIds, setBriefIds)} />{briefs.data?.length ? briefs.data.map((row) => <label className="check-row" key={row.id}><input type="checkbox" checked={briefIds.includes(row.id)} onChange={() => toggle(briefIds, setBriefIds, row.id)} /><span style={{ flex: 1 }}><strong>{row.briefNo}</strong> · {row.title}</span><Badge value={row.split} /></label>) : <Empty>没有 Brief</Empty>}</section>
        <section className="card selection-card"><SelectionHeader title="反例" count={counterexampleIds.length} allSelected={(counterexamples.data?.length ?? 0) > 0 && (counterexamples.data ?? []).every((row) => counterexampleIds.includes(row.id))} onToggleAll={() => toggleAll((counterexamples.data ?? []).map((row) => row.id), counterexampleIds, setCounterexampleIds)} />{counterexamples.data?.length ? counterexamples.data.map((row) => <label className="check-row" key={row.id}><input type="checkbox" checked={counterexampleIds.includes(row.id)} onChange={() => toggle(counterexampleIds, setCounterexampleIds, row.id)} /><span style={{ flex: 1 }}><strong>{row.counterexampleNo}</strong> · {row.title}</span><Badge value={row.status} /></label>) : <Empty>没有反例</Empty>}</section>
        <section className="card selection-card"><SelectionHeader title="候选设计" count={candidateIds.length} allSelected={(candidates.data?.length ?? 0) > 0 && (candidates.data ?? []).every((row) => candidateIds.includes(row.id))} onToggleAll={() => toggleAll((candidates.data ?? []).map((row) => row.id), candidateIds, setCandidateIds)} />{candidates.data?.length ? candidates.data.map((row) => <label className="check-row" key={row.id}><input type="checkbox" checked={candidateIds.includes(row.id)} onChange={() => toggle(candidateIds, setCandidateIds, row.id)} /><span style={{ flex: 1 }}><strong>{row.candidateNo}</strong> · {row.title}</span><Badge value={row.status} /></label>) : <Empty>没有候选</Empty>}</section>
      </div>
      {message ? <div className="error-box">{message}</div> : null}
      <div className="form-actions"><div className="small muted">当前已选 <strong>{total}</strong> 个条目。创建后仍可继续调整，导出时会重新校验授权。</div><button className="btn primary cta" disabled={busy || !stepOneDone || total === 0}><span className="cta-plus">＋</span>{busy ? "创建中…" : "创建数据集并进入校验"}</button></div>
    </form>
  </>;
}
