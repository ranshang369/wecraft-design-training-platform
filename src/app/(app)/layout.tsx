import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth";
import { Sidebar } from "@/components/sidebar";
import { api } from "@/lib/client";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getAuthContext();
  if (!ctx) redirect("/login");
  return <div className="app-shell"><Sidebar name={ctx.name} roles={ctx.roles} /><main className="main">{children}</main></div>;
}

