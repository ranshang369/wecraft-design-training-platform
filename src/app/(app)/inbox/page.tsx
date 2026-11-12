"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { useApi, formatDate } from "@/lib/client";
import { PageHeader, Badge, Empty } from "@/components/ui";

const TYPE_LABELS: Record<string, string> = { CASE_REVIEW: "案例评审", COUNTEREXAMPLE_REVIEW: "反例评审", ARBITRATION: "裁决", BLIND_PAIRWISE: "盲测比较" };

export default function InboxPage() {
  const { data, error, loading } = useApi<any[]>("/review-tasks");
  const [type, setType] = useState("ALL");
  const tasks = useMemo(() => (data ?? []).filter((task) => type === "ALL" || task.type === type), [data, type]);
  if (loading) return <div className="loading">加载待办任务…</div>;
  if (error) return <div className="error-box">{error}</div>;
  return <>
    <PageHeader title="我的待办" description="这里只显示分配给你的案例评审、反例评审、盲测和裁决任务。提交后不可原地覆盖，修订会生成新版本。" action={<Link className="btn" href="/notifications">查看通知</Link>} />
    <div className="card" style={{ marginBottom: 16 }}><div className="actions"><label className="small muted">任务类型</label><select className="select" style={{ width: 220 }} value={type} onChange={(event) => setType(event.target.value)}><option value="ALL">全部</option>{Object.entries(TYPE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><span className="small muted">共 {tasks.length} 项</span></div></div>
    {!tasks.length ? <Empty>当前没有待处理任务。你可以在通知中心查看已提交记录。</Empty> : <div className="grid">{tasks.map((task) => <Link className="card" href={"/tasks/" + task.id} key={task.id}><div className="card-head"><div><strong>{task.title}</strong><div className="card-sub">{TYPE_LABELS[task.type] ?? task.type} · 分配于 {formatDate(task.assignedAt)}</div></div><Badge value={task.status} /></div><div className="small muted">角色：{task.reviewRole === "ADJUDICATOR" ? "裁决人" : "评审"} · 轮次 {task.round}</div></Link>)}</div>}
  </>;
}
