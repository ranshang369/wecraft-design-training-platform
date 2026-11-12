"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client";

export function InviteForm({ token }: { token: string }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setLoading(true); setError(null);
    try { await api("/invitations/accept", { method: "POST", body: JSON.stringify({ token, name, password }) }); router.push("/dashboard"); router.refresh(); }
    catch (err) { setError(err instanceof Error ? err.message : "接受邀请失败"); }
    finally { setLoading(false); }
  }
  return <form onSubmit={submit} className="grid" style={{ gap: 14 }}>
    <div className="field"><label>你的姓名</label><input className="input" value={name} onChange={(e) => setName(e.target.value)} required /></div>
    <div className="field"><label>设置密码</label><input className="input" type="password" minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} required /><span className="hint">至少 8 位；仅用于内部演示与试点。</span></div>
    {error ? <div className="error-box">{error}</div> : null}
    <button className="btn primary" disabled={loading}>{loading ? "处理中…" : "接受邀请并登录"}</button>
  </form>;
}

