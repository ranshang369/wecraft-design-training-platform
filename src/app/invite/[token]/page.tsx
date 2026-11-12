import { InviteForm } from "@/components/invite-form";

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <main className="login-page"><section className="login-intro"><div><div style={{ fontSize: 11, letterSpacing: 2, opacity: .7, marginBottom: 36 }}>WECRAFT INTERNAL TOOL</div><h1>加入设计训练协作。</h1><p style={{ marginTop: 24 }}>邀请链接一次性使用。接受后由 Workspace 角色决定你能看到和操作的内容。</p></div><div style={{ fontSize: 12, opacity: .7 }}>邀请 token 只保存在 URL 一次，服务端仅存储 hash。</div></section><section className="login-card"><div className="login-box"><h2>接受邀请</h2><p className="muted small" style={{ margin: "8px 0 22px" }}>填写姓名和密码。已有账号会直接关联当前 Workspace 角色。</p><InviteForm token={token} /></div></section></main>;
}

