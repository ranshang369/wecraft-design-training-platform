"use client";
import Link from "next/link";
import { useApi, formatPercent } from "@/lib/client";
import { PageHeader, Stat, Badge } from "@/components/ui";
import { ARCHETYPES } from "@/lib/constants";

export default function DashboardPage() {
  const { data, error, loading } = useApi<any>("/dashboard");
  const me = useApi<any>("/auth/me");
  if (loading) return <div className="loading">正在加载仪表盘…</div>;
  if (error) return <div className="error-box">{error}</div>;
  const readiness = data.readiness;
  const roles: string[] = me.data?.roles ?? [];
  const canEditCases = roles.some((role) => ["OWNER", "DESIGN_LEAD", "ANNOTATOR"].includes(role));
  const canCreateDataset = roles.some((role) => ["OWNER", "DESIGN_LEAD", "AI_ENGINEER"].includes(role));
  const gate = data.dataGate;
  return <>
    <PageHeader title="设计训练工作台" description="一屏查看案例、授权、评审与盲测状态。所有指标都可回溯到具体记录。" />
    {canEditCases || canCreateDataset ? <div className="quick-actions" style={{ gridTemplateColumns: canEditCases && canCreateDataset ? undefined : "1fr" }}>
      {canEditCases ? <Link className="quick-action primary" href="/cases/new"><span className="quick-action-icon">＋</span><span className="quick-action-copy"><strong>录入设计案例</strong><small>上传 375px 截图，填写机制、证据与六维评分</small></span><span className="quick-action-arrow">→</span></Link> : null}
      {canCreateDataset ? <Link className="quick-action" href="/datasets/new"><span className="quick-action-icon">＋</span><span className="quick-action-copy"><strong>创建数据集</strong><small>选择条目，完成授权校验、冻结与可追溯导出</small></span><span className="quick-action-arrow">→</span></Link> : null}
    </div> : null}
    <div className="grid grid-4">
      <Stat label="优质案例" value={data.counts.eligibleCases + " / 30"} note={"案例总量 " + data.counts.cases + " · 目标 30–36"} />
      <Stat label="授权完整度" value={formatPercent(data.authorization.rate)} note={data.authorization.complete + " / " + data.authorization.eligible + " 个已批准案例证据已核验"} />
      <Stat label="评审完成度" value={formatPercent(data.reviews.rate)} note={data.reviews.complete + " / " + data.reviews.total + " 个案例已完成双评"} />
      <Stat label="硬失败率" value={formatPercent(data.hardChecks.failureRate)} note={data.hardChecks.failed + " / " + data.hardChecks.checked + " 个候选最新硬检查存在 BLOCK"} />
    </div>
    <section className="card" style={{ marginTop: 16 }}>
      <div className="card-head"><div><h2>正式试点数据门禁</h2><div className="card-sub">全部通过后才具备真实训练与效果验收的数据基础；不替代备份、告警和业务签收。</div></div><Badge value={gate.ready ? "ELIGIBLE" : "BLOCKED"} /></div>
      <div className="gate-list">{gate.checks.map((check: any) => <div className="gate-row" key={check.id}><span className={"gate-dot " + (check.passed ? "pass" : "block")} /><span className="gate-label">{check.label}</span><span className="small muted">{check.current} / {check.target}</span><span className="gate-state">{check.passed ? "已通过" : "待补齐"}</span></div>)}</div>
    </section>
    <div className="grid grid-2" style={{ marginTop: 16 }}>
      <section className="card">
        <div className="card-head"><div><h2>主型覆盖</h2><div className="card-sub">每个主型目标 4 个已具备资格案例，最少 3 个。</div></div><span className="badge gray">9 个主型</span></div>
        <div className="table-wrap"><table><thead><tr><th>主型</th><th>已批准</th><th>目标</th><th>缺口</th></tr></thead><tbody>{ARCHETYPES.map((a) => { const row = data.coverage[a.code] ?? { approved: 0, target: 4 }; return <tr key={a.code}><td>{a.label}</td><td>{row.approved}</td><td>{row.target}</td><td><Badge value={row.approved >= row.target ? "ELIGIBLE" : row.approved >= 3 ? "READY_FOR_APPROVAL" : "BLOCKED"} /><span className="small muted" style={{ marginLeft: 6 }}>{Math.max(0, row.target - row.approved)}</span></td></tr>; })}</tbody></table></div>
      </section>
      <div className="grid">
        <section className="card"><div className="card-head"><div><h2>评审一致性</h2><div className="card-sub">当前采用可发布结论一致率 + 各维平均绝对差。</div></div></div><div className="grid grid-2"><div><div className="stat-label">结论一致率</div><div className="stat-value">{formatPercent(data.consistency.agreement)}</div></div><div><div className="stat-label">各维平均绝对差</div><div className="stat-value">{data.consistency.meanAbsoluteDifference == null ? "—" : data.consistency.meanAbsoluteDifference.toFixed(2)}</div></div></div><div className="stat-note">样本 pair：{data.consistency.pairs}；{data.consistency.sampleSufficient ? "可观察" : "样本不足，不据此下质量结论"}</div></section>
        <section className="card"><div className="card-head"><div><h2>盲测与准备度</h2><div className="card-sub">TIE 单列，不进入偏好训练数据。</div></div></div><div className="grid grid-2"><div><div className="stat-label">盲测比较数</div><div className="stat-value">{data.blind.comparisons}</div><div className="small muted">偏好明确率 {formatPercent(data.blind.decisiveRate)} · TIE {formatPercent(data.blind.tieRate)}</div></div><div><div className="stat-label">黄金 Brief</div><div className="stat-value">{data.counts.briefs}</div><div className="small muted">目标 60</div></div></div><div className="stat-note">案例 {readiness.cases.current}/{readiness.cases.target} · 反例 {readiness.counterexamples.current}/{readiness.counterexamples.target} · Brief {readiness.goldenBriefs.current}/{readiness.goldenBriefs.target}</div>{data.blind.winners?.length ? <div className="small muted" style={{ marginTop: 10 }}>候选胜率：{data.blind.winners.map((row: any) => row.candidateNo + " " + formatPercent(row.winRate)).join(" · ")}</div> : null}</section>
        <div className="notice">数据准备度不是完成率：未解决分歧、授权缺失、BLOCK 硬检查和 Holdout 误用都会阻断数据集导出。</div>
      </div>
    </div>
  </>;
}

