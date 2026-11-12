"use client";
import Link from "next/link";
import { useApi, formatDate } from "@/lib/client";
import { PageHeader, Badge, Empty } from "@/components/ui";

export default function CandidatesPage() {
  const query = useApi<any[]>("/candidates");
  const me = useApi<any>("/auth/me");
  const canSubmit = (me.data?.roles ?? []).includes("AI_ENGINEER");
  if (query.loading) return <div className="loading">加载候选设计…</div>;
  if (query.error) return <div className="error-box">{query.error}</div>;
  return <>
    <PageHeader title="候选设计" description="候选是待验证的 AI 生成稿，不是优质案例。提交后先运行硬检查，再进入盲测。" action={canSubmit ? <Link className="btn primary" href="/candidates/new">提交候选</Link> : undefined} />
    {!query.data?.length ? <Empty>还没有候选。AI 工程可以从 HTML 与 375px 截图提交。</Empty> : <div className="card flush"><div className="table-wrap"><table><thead><tr><th>编号 / 标题</th><th>状态</th><th>硬检查</th><th>模型</th><th>更新</th></tr></thead><tbody>{query.data.map((candidate) => <tr key={candidate.id} className="row-link"><td><Link href={"/candidates/" + candidate.id}><strong>{candidate.candidateNo}</strong> · {candidate.title}</Link></td><td><Badge value={candidate.status} /></td><td>{candidate.hardCheckRuns?.[0] ? <Badge value={candidate.status === "HARD_CHECK_FAILED" ? "FAILED" : "COMPLETED"} /> : <span className="muted">未运行</span>}</td><td className="small muted">{candidate.versions?.[0]?.modelProvider ?? "已隐藏"} / {candidate.versions?.[0]?.modelName ?? "—"} / {candidate.versions?.[0]?.modelVersion ?? "—"}</td><td className="small muted">{formatDate(candidate.updatedAt)}</td></tr>)}</tbody></table></div></div>}
  </>;
}
