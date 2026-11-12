"use client";
import Link from "next/link";
import { useApi, formatDate } from "@/lib/client";
import { PageHeader, Badge, Empty } from "@/components/ui";

export default function ExperimentsPage() {
  const query = useApi<any[]>("/experiments");
  if (query.loading) return <div className="loading">加载实验…</div>;
  if (query.error) return <div className="error-box">{query.error}</div>;
  return <>
    <PageHeader title="实验与盲测" description="实验比较候选设计。盲测期间隐藏模型、来源和上一轮分数；两名评审提交后由裁决人确认。" action={<Link className="btn primary" href="/experiments/new">创建实验</Link>} />
    {!query.data?.length ? <Empty>还没有实验。先准备两个通过硬检查、状态为 READY_FOR_BLIND 的候选设计。</Empty> : <div className="grid grid-2">{query.data.map((experiment) => <Link className="card" href={"/experiments/" + experiment.id} key={experiment.id}><div className="card-head"><div><h2>{experiment.experimentNo} · {experiment.name}</h2><div className="card-sub">创建于 {formatDate(experiment.createdAt)} · {experiment._count?.pairs ?? 0} 个 pair · {experiment._count?.candidates ?? 0} 个候选</div></div><Badge value={experiment.status} /></div><div className="small muted">评分表 {experiment.rubricVersion} · 协议冻结后不可改写</div></Link>)}</div>}
  </>;
}
