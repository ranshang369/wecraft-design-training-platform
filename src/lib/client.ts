"use client";
import { useCallback, useEffect, useState } from "react";

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path.startsWith("/api/") ? path : "/api/v1" + path, {
    ...init,
    headers: init?.body instanceof FormData ? init.headers : { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) {
    const message = data?.error?.message ?? "请求失败";
    const error = new Error(message) as Error & { status?: number; details?: unknown; code?: string };
    error.status = response.status;
    error.details = data?.error?.details;
    error.code = data?.error?.code;
    throw error;
  }
  return data as T;
}

export function useApi<T>(path: string) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const reload = useCallback(async () => {
    setLoading(true); setError(null);
    try { setData(await api<T>(path)); }
    catch (err) { setError(err instanceof Error ? err.message : "加载失败"); }
    finally { setLoading(false); }
  }, [path]);
  useEffect(() => { void reload(); }, [reload]);
  return { data, error, loading, reload, setData };
}

export function formatDate(value: string | Date | null | undefined) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}
export function formatPercent(value: number | null | undefined) {
  if (value == null || Number.isNaN(value)) return "样本不足";
  return (value * 100).toFixed(1) + "%";
}

