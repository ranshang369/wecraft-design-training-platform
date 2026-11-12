import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth";
import { LoginForm } from "@/components/login-form";

export default async function LoginPage() {
  const ctx = await getAuthContext();
  if (ctx) redirect("/dashboard");
  return <main className="login-page">
    <section className="login-intro">
      <div><div style={{ fontSize: 11, letterSpacing: 2, opacity: .7, marginBottom: 36 }}>WECRAFT INTERNAL TOOL</div><h1>让设计训练数据<br />可评审，也可追溯。</h1><p style={{ marginTop: 24 }}>在这里完成 Brief、案例、反例、候选、盲测、裁决和数据导出。飞书仍然负责文档与沟通；平台只管理结构化资产和证据。</p></div>
      <div style={{ fontSize: 12, opacity: .7 }}>独立内部平台 · 不运行模型训练 · 不连接生产数据库</div>
    </section>
    <section className="login-card">
      <div className="login-box">
        <h2>登录设计训练平台</h2>
        <p className="muted small" style={{ margin: "8px 0 22px" }}>使用邀请邮箱登录。演示账号已预置，确认环境后再替换为飞书 OAuth。</p>
        <LoginForm />
        <div className="demo-list"><strong style={{ color: "var(--ink)" }}>演示账号 · 密码 Demo1234!</strong><div>owner@example.test · 项目负责人</div><div>lead@example.test · 设计负责人</div><div>annotator@example.test · 标注/QA</div><div>engineer@example.test · AI 工程</div><div>admin@example.test · 平台管理员</div></div>
      </div>
    </section>
  </main>;
}

