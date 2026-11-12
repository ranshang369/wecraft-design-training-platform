"use client";
import Link from "next/link";
import { use } from "react";
import { useApi, formatDate } from "@/lib/client";
import { PageHeader, Badge, Empty } from "@/components/ui";

export default function BlindIndexPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const blind = useApi<any>("/experiments/" + id + "/blind");
  const tasks = useApi<any[]>("/review-tasks");
  if (blind.loading || tasks.loading) return <div className="loading">加载盲测房间…</div>;
  if (blind.error) return <div className="error-box">{blind.error}</div>;
  const byPair = new Map((tasks.data ?? []).filter((task) => task.type === "BLIND_PAIRWISE").map((task) => [task.experimentPairId, task]));
  return <>
    <PageHeader title="盲测房间" description={(blind.data?.experiment?.experimentNo ?? "") + " · " + (blind.data?.experiment?.name ?? "") + " · 模型、来源与上一轮分数保持隐藏"} action={<Link className="btn" href={"/experiments/" + id}>返回实验</Link>} />
    {blind.data?.experiment?.status !== "RUNNING" ? <div className="notice" style={{ marginBottom: 16 }}>当前实验状态为 {blind.data?.experiment?.status}，只有 RUNNING 状态可继续提交。</div> : null}
    {!blind.data?.pairs?.length ? <Empty>当前没有分配给你的盲测 pair。</Empty> : <div className="grid">{blind.data.pairs.map((pair: any) => { const task = byPair.get(pair.id); return <div className="card" key={pair.id}><div className="card-head"><div><h2>{pair.pairNo}</h2><div className="card-sub">Pair 状态：{pair.status} · {pair.submitted ? "你已提交" : "等待你的独立评审"}</div></div><Badge value={pair.submitted ? "SUBMITTED" : pair.status} /></div><div className="actions">{pair.submitted ? <span className="success-box" style={{ padding: "6px 10px" }}>已提交，不可直接修改</span> : task ? <Link className="btn primary" href={"/experiments/" + id + "/blind/" + pair.id}>进入 A/B 评审</Link> : <span className="small muted">任务未分配给当前账号</span>}</div></div>; })}</div>}
  </>;
}
