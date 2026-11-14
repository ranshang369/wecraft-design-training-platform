import Link from "next/link";
import { STATUS_LABELS } from "@/lib/constants";

const BADGE_CLASS: Record<string, string> = {
  ELIGIBLE: "green", APPROVED: "green", READY: "green", COMPLETED: "green", SENT: "green",
  IN_REVIEW: "blue", SUBMITTED: "blue", RUNNING: "blue", IN_PROGRESS: "blue", READY_FOR_BLIND: "blue",
  ARBITRATION: "amber", PENDING: "amber", ASSIGNED: "amber", CHANGES_REQUESTED: "amber", READY_FOR_APPROVAL: "amber", VALIDATING: "amber",
  REJECTED: "red", BLOCKED: "red", HARD_CHECK_FAILED: "red", FAILED: "red", QUARANTINED: "red", REVOKED: "red", DECLINED: "red",
  DRAFT: "gray", ARCHIVED: "gray", CANCELLED: "gray", WITHDRAWN: "gray", HOLDOUT: "amber", DEV: "gray",
  INSUFFICIENT_SAMPLE: "gray", OBSERVED_BENEFIT: "green", OBSERVED_HARM: "red", INCONCLUSIVE: "amber",
};

export function Badge({ value }: { value: string | null | undefined }) {
  if (!value) return null;
  return <span className={"badge " + (BADGE_CLASS[value] ?? "gray")}>{STATUS_LABELS[value] ?? value}</span>;
}
export function PageHeader({ title, description, action }: { title: string; description?: string; action?: React.ReactNode }) {
  return <div className="page-header"><div><h1>{title}</h1>{description ? <p>{description}</p> : null}</div>{action ? <div className="actions">{action}</div> : null}</div>;
}
export function Empty({ children }: { children: React.ReactNode }) { return <div className="empty">{children}</div>; }
export function Stat({ label, value, note }: { label: string; value: React.ReactNode; note?: React.ReactNode }) {
  return <div className="card"><div className="stat-label">{label}</div><div className="stat-value">{value}</div>{note ? <div className="stat-note">{note}</div> : null}</div>;
}
export function CardLink({ href, title, meta, badge }: { href: string; title: string; meta?: React.ReactNode; badge?: React.ReactNode }) {
  return <Link href={href} className="card" style={{ display: "block" }}><div className="card-head"><h3>{title}</h3>{badge}</div>{meta ? <div className="card-sub">{meta}</div> : null}</Link>;
}

