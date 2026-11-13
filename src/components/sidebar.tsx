"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { api } from "@/lib/client";
import { ROLE_LABELS } from "@/lib/constants";

const baseSections = [
  { label: "工作台", links: [["/dashboard", "仪表盘"], ["/inbox", "我的待办"], ["/notifications", "通知中心"]] },
  { label: "内容与案例", links: [["/briefs", "Brief 管理"], ["/cases", "案例库"]] },
  { label: "实验与数据", links: [["/candidates", "候选设计"], ["/experiments", "实验与盲测"], ["/datasets", "数据集导出"]] },
];

export function Sidebar({ name, roles }: { name: string; roles: string[] }) {
  const pathname = usePathname();
  const router = useRouter();
  const canManageMembers = roles.some((role) => ["OWNER", "ADMIN"].includes(role));
  const canViewAudit = roles.some((role) => ["OWNER", "ADMIN", "DESIGN_LEAD", "CONTENT_LEAD"].includes(role));
  const canEditCases = roles.some((role) => ["OWNER", "DESIGN_LEAD", "ANNOTATOR"].includes(role));
  const canCreateDataset = roles.some((role) => ["OWNER", "DESIGN_LEAD", "AI_ENGINEER"].includes(role));
  const sections = [...baseSections, ...(canManageMembers || canViewAudit ? [{ label: "设置", links: [...(canManageMembers ? [["/settings/members", "成员与角色"]] : []), ...(canViewAudit ? [["/settings/audit", "审计日志"]] : [])] }] : [])];
  async function logout() { await api("/auth/logout", { method: "POST" }); router.push("/login"); router.refresh(); }
  return <aside className="sidebar">
    <div className="brand"><span className="brand-mark">W</span><div><strong>WeCraft</strong><span>Design Training</span></div></div>
    {canEditCases || canCreateDataset ? <div className="sidebar-actions">
      {canEditCases ? <Link className="sidebar-cta primary" href="/cases/new"><span className="sidebar-cta-icon">＋</span><span><strong>录入案例</strong><small>截图 · 证据 · 评分</small></span><span className="sidebar-cta-arrow">↗</span></Link> : null}
      {canCreateDataset ? <Link className="sidebar-cta" href="/datasets/new"><span className="sidebar-cta-icon">＋</span><span><strong>创建数据集</strong><small>校验 · 冻结 · 导出</small></span><span className="sidebar-cta-arrow">↗</span></Link> : null}
    </div> : null}
    {sections.map((section) => <div key={section.label}><div className="nav-group">{section.label}</div>{section.links.map(([href, label]) => <Link key={href} href={href} className={"nav-link " + (pathname === href || pathname.startsWith(href + "/") ? "active" : "")}>{label}</Link>)}</div>)}
    <div className="sidebar-footer"><div style={{ marginBottom: 8 }}>{name}</div><div style={{ marginBottom: 10 }}>{roles.map((r) => ROLE_LABELS[r] ?? r).join(" / ")}</div><button className="btn small" style={{ width: "100%" }} onClick={logout}>退出登录</button></div>
  </aside>;
}

