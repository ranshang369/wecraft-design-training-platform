"use client";
import Link from "next/link";
import { useState } from "react";
import { useApi, formatDate } from "@/lib/client";
import { PageHeader, Badge, Empty } from "@/components/ui";
import { ARCHETYPES } from "@/lib/constants";

export default function CasesPage() {
  const [tab, setTab] = useState<"quality"|"anti">("quality");
  const quality = useApi<any[]>("/cases");
  const anti = useApi<any[]>("/counterexamples");
  const data = tab === "quality" ? quality : anti;
  if (data.loading) return <div className="loading">加载案例库…</div>;
  if (data.error) return <div className="error-box">{data.error}</div>;
  return <>
    <PageHeader title="案例库" description="优质案例与反例是独立对象。案例卡只描述可复用机制、适用条件和证据，不等同于飞书文档。" action={<Link className="btn primary" href={tab === "quality" ? "/cases/new" : "/counterexamples/new"}>{tab === "quality" ? "新建优质案例" : "新建反例"}</Link>} />
    <div className="tabs"><button className={"tab " + (tab === "quality" ? "active" : "")} onClick={() => setTab("quality")}>优质案例 {quality.data?.length ?? 0}</button><button className={"tab " + (tab === "anti" ? "active" : "")} onClick={() => setTab("anti")}>反例 {anti.data?.length ?? 0}</button></div>
    {!data.data?.length ? <Empty>{tab === "quality" ? "还没有优质案例。先从案例卡开始。" : "还没有反例。反例需要可复现失败和修复建议。"}</Empty> : <div className="grid grid-2">{data.data.map((row) => <Link className="card" href={tab === "quality" ? "/cases/" + row.id : "/counterexamples/" + row.id} key={row.id}><div className="card-head"><div><div className="small muted mono">{row.caseNo ?? row.counterexampleNo}</div><h2 style={{ marginTop: 4 }}>{row.title}</h2></div><Badge value={row.status} /></div><div className="actions" style={{ marginTop: 12 }}><span className="badge gray">{ARCHETYPES.find((a) => a.code === row.archetype)?.label ?? row.archetype}</span>{row.split ? <Badge value={row.split} /> : null}<span className="small muted">更新 {formatDate(row.updatedAt)}</span></div><div className="card-sub" style={{ marginTop: 12 }}>{tab === "quality" ? (row.versions?.[0]?.designMechanism ?? "") : (row.versions?.[0]?.failureSummary ?? "")}</div></Link>)}</div>}
  </>;
}

