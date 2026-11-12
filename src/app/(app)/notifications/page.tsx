"use client";
import Link from "next/link";
import { api, useApi, formatDate } from "@/lib/client";
import { PageHeader, Badge, Empty } from "@/components/ui";

export default function NotificationsPage() {
  const query = useApi<any[]>("/notifications");
  async function mark(id: string) { await api("/notifications/" + id + "/read", { method: "PATCH" }); await query.reload(); }
  async function markAll() { await api("/notifications/read-all", { method: "POST" }); await query.reload(); }
  if (query.loading) return <div className="loading">加载通知…</div>;
  if (query.error) return <div className="error-box">{query.error}</div>;
  const unread = (query.data ?? []).filter((row) => !row.readAt).length;
  return <>
    <PageHeader title="通知中心" description="MVP 使用站内通知；飞书通知通过适配层预留。通知只做提醒，不替代结构化记录。" action={<button className="btn" disabled={!unread} onClick={markAll}>全部标记已读</button>} />
    <div className="card" style={{ marginBottom: 16 }}><span className="small muted">未读 {unread} · 共 {query.data?.length ?? 0} 条</span></div>
    {!query.data?.length ? <Empty>没有通知。</Empty> : <div className="grid">{query.data.map((notification) => <div className={notification.readAt ? "card" : "card"} key={notification.id} style={notification.readAt ? {} : { borderLeft: "4px solid var(--accent)" }}><div className="card-head"><div><strong>{notification.title}</strong><div className="card-sub">{notification.type} · {formatDate(notification.createdAt)} · {notification.channel}</div></div><Badge value={notification.status} /></div><div className="actions">{notification.deepLink ? <Link className="btn small" href={notification.deepLink}>打开关联页面</Link> : null}{!notification.readAt ? <button className="btn small" onClick={() => mark(notification.id)}>标记已读</button> : <span className="small muted">已读</span>}</div></div>)}</div>}
  </>;
}
