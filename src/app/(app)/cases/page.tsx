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
  const me = useApi<any>("/auth/me");
  const data = tab === "quality" ? quality : anti;
  if (data.loading) return <div className="loading">加载案例库…</div>;
  if (data.error) return <div className="error-box">{data.error}</div>;
  const roles: string[] = me.data?.roles ?? [];
  const canCreateQuality = roles.some((role) => ["OWNER", "DESIGN_LEAD", "ANNOTATOR"].includes(role));
  const canCreateAnti = roles.some((role) => ["OWNER", "DESIGN_LEAD", "ANNOTATOR", "AI_ENGINEER"].includes(role));
  const primaryHref = tab === "quality" ? "/cases/new" : "/counterexamples/new";
  const primaryLabel = tab === "quality" ? "录入优质案例" : "录入反例";
  return <>
    <PageHeader title="案例库" description="优质案例沉淀可复用机制，反例记录可复现的失败。两者独立入库、独立授权。" action={(tab === "quality" ? canCreateQuality : canCreateAnti) ? <Link className="btn primary cta" href={primaryHref}><span className="cta-plus">＋</span>{primaryLabel}</Link> : undefined} />
    <div className="collection-toolbar">
      <div className="tabs"><button className={"tab " + (tab === "quality" ? "active" : "")} onClick={() => setTab("quality")}>优质案例 {quality.data?.length ?? 0}</button><button className={"tab " + (tab === "anti" ? "active" : "")} onClick={() => setTab("anti")}>反例 {anti.data?.length ?? 0}</button></div>
      <span className="collection-meta">{tab === "quality" ? "可复用设计机制与证据" : "失败方式、根因与修复建议"}</span>
    </div>
    {!data.data?.length ? <Empty>{tab === "quality" ? "还没有优质案例。先从案例卡开始。" : "还没有反例。反例需要可复现失败和修复建议。"}</Empty> : <div className="grid grid-2">{data.data.map((row) => <Link className="card case-card" href={tab === "quality" ? "/cases/" + row.id : "/counterexamples/" + row.id} key={row.id}><div className="card-head"><div><div className="small muted mono">{row.caseNo ?? row.counterexampleNo}</div><h2 style={{ marginTop: 5 }}>{row.title}</h2></div><Badge value={row.status} /></div><div className="actions" style={{ marginTop: 12 }}><span className="badge gray">{ARCHETYPES.find((a) => a.code === row.archetype)?.label ?? row.archetype}</span>{row.split ? <Badge value={row.split} /> : null}<span className="small muted">更新 {formatDate(row.updatedAt)}</span></div><div className="card-sub" style={{ marginTop: 12 }}>{tab === "quality" ? (row.versions?.[0]?.designMechanism ?? "") : (row.versions?.[0]?.failureSummary ?? "")}</div><div className="case-card-cta"><span>{tab === "quality" ? "打开案例卡" : "查看失败证据"}</span><span>→</span></div></Link>)}</div>}
  </>;
}

