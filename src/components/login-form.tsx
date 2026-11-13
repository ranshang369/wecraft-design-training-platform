"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client";

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  async function submit(event: React.FormEvent) {
    event.preventDefault(); setLoading(true); setError(null);
    try { await api("/auth/login", { method: "POST", body: JSON.stringify({ email, password }) }); router.push("/dashboard"); router.refresh(); }
    catch (err) { setError(err instanceof Error ? err.message : "登录失败"); }
    finally { setLoading(false); }
  }
  return <form onSubmit={submit} className="grid" style={{ gap: 14 }}>
    <div className="field"><label>邮箱</label><input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" required /></div>
    <div className="field"><label>密码</label><input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required /></div>
    {error ? <div className="error-box">{error}</div> : null}
    <button className="btn primary" disabled={loading} type="submit" style={{ height: 42 }}>{loading ? "登录中…" : "登录工作台"}</button>
  </form>;
}

