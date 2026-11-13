"use client";
import Link from "next/link";
import { useApi, formatDate } from "@/lib/client";
import { PageHeader, Badge, Empty } from "@/components/ui";

export default function DatasetsPage() {
  const query = useApi<any[]>("/datasets");
  const me = useApi<any>("/auth/me");
  if (query.loading) return <div className="loading">加载数据集…</div>;
  if (query.error) return <div className="error-box">{query.error}</div>;
  const roles: string[] = me.data?.roles ?? [];
  const canCreate = roles.some((role) => ["OWNER", "DESIGN_LEAD", "AI_ENGINEER"].includes(role));
  return <>
    <PageHeader title="数据集导出" description="选择条目、校验授权、冻结版本，再导出可追溯的数据包。" action={canCreate ? <Link className="btn primary cta" href="/datasets/new"><span className="cta-plus">＋</span>创建数据集</Link> : undefined} />
    {!query.data?.length ? <Empty>还没有数据集。创建后先校验授权，再由 Owner/Design Lead 批准导出。</Empty> : <div className="card flush"><div className="table-wrap"><table><thead><tr><th>编号 / 名称</th><th>类型</th><th>状态</th><th>条目</th><th>导出次数</th><th>更新</th></tr></thead><tbody>{query.data.map((dataset) => <tr key={dataset.id} className="row-link"><td><Link href={"/datasets/" + dataset.id}><strong>{dataset.datasetNo}</strong> · {dataset.name}</Link></td><td><Badge value={dataset.type} /></td><td><Badge value={dataset.status} /></td><td>{dataset.itemCount} / {dataset._count?.items ?? 0}</td><td>{dataset._count?.exports ?? 0}</td><td className="small muted">{formatDate(dataset.updatedAt)}</td></tr>)}</tbody></table></div></div>}
  </>;
}
