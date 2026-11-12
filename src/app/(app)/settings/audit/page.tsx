"use client";
import { useMemo, useState } from "react";
import { useApi, formatDate } from "@/lib/client";
import { PageHeader, Empty } from "@/components/ui";

export default function AuditPage() {
  const logs = useApi<any[]>("/audit-logs");
  const members = useApi<any[]>("/members");
  const [filter, setFilter] = useState("");
  const names = useMemo(() => new Map((members.data ?? []).map((member) => [member.user.id, member.user.name])), [members.data]);
  const rows = (logs.data ?? []).filter((row) => !filter || (row.action + " " + row.resourceType + " " + (row.resourceId ?? "") + " " + (row.reason ?? "")).toLowerCase().includes(filter.toLowerCase()));
  if (logs.loading) return <div className="loading">加载审计日志…</div>;
  if (logs.error) return <div className="error-box">{logs.error}</div>;
  return <>
    <PageHeader title="审计日志" description="登录、授权变更、评审提交、案例发布、成员角色、数据集校验与导出均追加记录。entryHash 与 prevHash 形成可校验链。" action={<input className="input" style={{ width: 280 }} placeholder="筛选动作、资源或理由" value={filter} onChange={(event) => setFilter(event.target.value)} />} />
    {!rows.length ? <Empty>没有匹配的审计记录。</Empty> : <div className="card flush"><div className="table-wrap"><table><thead><tr><th>时间</th><th>操作人</th><th>动作</th><th>资源</th><th>理由</th><th>链 hash</th></tr></thead><tbody>{rows.map((row) => <tr key={String(row.id)}><td className="small muted">{formatDate(row.occurredAt)}</td><td>{row.actorId ? (names.get(row.actorId) ?? row.actorId.slice(0, 8)) : "系统"}</td><td className="mono small">{row.action}</td><td className="small">{row.resourceType}<div className="mono muted">{row.resourceId?.slice(0, 8) ?? "—"}</div></td><td className="small">{row.reason ?? "—"}</td><td className="mono small" title={row.entryHash}>{row.entryHash?.slice(0, 16)}…</td></tr>)}</tbody></table></div></div>}
  </>;
}
