"use client";
import { useState } from "react";
import { api, useApi, formatDate } from "@/lib/client";
import { PageHeader, Badge, Empty } from "@/components/ui";
import { ROLE_LABELS } from "@/lib/constants";

const ROLE_CODES = ["OWNER","ADMIN","DESIGN_LEAD","CONTENT_LEAD","EDITOR","ANNOTATOR","AI_ENGINEER","VIEWER"];
function MemberRow({ member, onSaved }: { member: any; onSaved: () => Promise<void> }) {
  const initial = member.roles.map((row: any) => row.role.code);
  const [roles, setRoles] = useState<string[]>(initial);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function save() {
    setBusy(true); setMessage(null);
    try { await api("/members/" + member.id + "/roles", { method: "PATCH", body: JSON.stringify({ roles }) }); await onSaved(); setMessage("已保存"); }
    catch (error) { setMessage(error instanceof Error ? error.message : "保存失败"); }
    finally { setBusy(false); }
  }
  return <div className="card"><div className="card-head"><div><strong>{member.user.name}</strong><div className="card-sub">{member.user.email} · 加入于 {formatDate(member.createdAt)}</div></div><div className="actions">{initial.map((code: string) => <Badge key={code} value={code} />)}</div></div><div className="grid grid-4">{ROLE_CODES.map((code) => <label className="check-row" key={code}><input type="checkbox" checked={roles.includes(code)} onChange={(event) => setRoles((current) => event.target.checked ? [...current, code] : current.filter((value) => value !== code))} /><span>{ROLE_LABELS[code]}</span></label>)}</div>{message ? <div className={message === "已保存" ? "success-box" : "error-box"} style={{ marginTop: 10 }}>{message}</div> : null}<button className="btn primary" style={{ marginTop: 12 }} disabled={busy || !roles.length} onClick={save}>保存角色</button></div>;
}
export default function MembersPage() {
  const members = useApi<any[]>("/members");
  const invitations = useApi<any[]>("/invitations");
  const [email, setEmail] = useState("");
  const [roleCode, setRoleCode] = useState("ANNOTATOR");
  const [acceptUrl, setAcceptUrl] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  async function invite(event: React.FormEvent) {
    event.preventDefault(); setMessage(null);
    try { const result: any = await api("/invitations", { method: "POST", body: JSON.stringify({ email, roleCode }) }); setAcceptUrl(window.location.origin + result.acceptUrl); setEmail(""); await invitations.reload(); setMessage("邀请已创建，有效期 7 天。"); }
    catch (error) { setMessage(error instanceof Error ? error.message : "邀请失败"); }
  }
  if (members.loading || invitations.loading) return <div className="loading">加载成员…</div>;
  if (members.error || invitations.error) return <div className="error-box">{members.error ?? invitations.error}</div>;
  return <>
    <PageHeader title="成员与角色" description="服务端按 Workspace 与角色鉴权。邮箱邀请与站内通知先行，飞书登录/通知保留适配层。" />
    <div className="grid grid-2" style={{ marginBottom: 16 }}>
      <section className="card"><div className="card-head"><h2>邀请成员</h2><span className="small muted">7 天有效</span></div><form className="grid" onSubmit={invite}><div className="form-grid"><div className="field"><label>邮箱</label><input className="input" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></div><div className="field"><label>初始角色</label><select className="select" value={roleCode} onChange={(event) => setRoleCode(event.target.value)}>{ROLE_CODES.map((code) => <option key={code} value={code}>{ROLE_LABELS[code]}</option>)}</select></div></div><button className="btn primary" disabled={roleCode === "OWNER"}>创建邀请</button></form>{acceptUrl ? <div className="success-box" style={{ marginTop: 12 }}><div className="small">一次性邀请链接（仅展示本次）：</div><div className="mono small" style={{ wordBreak: "break-all" }}>{acceptUrl}</div></div> : null}{message ? <div className={message === "邀请已创建，有效期 7 天。" ? "success-box" : "error-box"} style={{ marginTop: 10 }}>{message}</div> : null}</section>
      <section className="card"><div className="card-head"><h2>待接受邀请</h2><span className="small muted">{(invitations.data ?? []).filter((row) => row.status === "PENDING").length} 条</span></div>{invitations.data?.length ? <div className="timeline">{invitations.data.slice(0, 8).map((invitation) => <div className="timeline-item" key={invitation.id}><div className="small muted">{formatDate(invitation.createdAt)}</div><div><div>{invitation.email}</div><div className="small muted">{ROLE_LABELS[invitation.roleCode] ?? invitation.roleCode} · <Badge value={invitation.status} /></div></div></div>)}</div> : <Empty>还没有邀请。</Empty>}</section>
    </div>
    <h2 style={{ marginBottom: 12 }}>当前成员</h2>
    {!members.data?.length ? <Empty>Workspace 还没有成员。</Empty> : <div className="grid">{members.data.map((member) => <MemberRow key={member.id} member={member} onSaved={members.reload} />)}</div>}
  </>;
}
