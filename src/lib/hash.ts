import { createHash, randomBytes } from "node:crypto";

export function sha256(value: string | Buffer) {
  return createHash("sha256").update(value).digest("hex");
}

export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return "[" + value.map(stableStringify).join(",") + "]";
  const obj = value as Record<string, unknown>;
  return "{" + Object.keys(obj).sort().map((k) => JSON.stringify(k) + ":" + stableStringify(obj[k])).join(",") + "}";
}

export function hashObject(value: unknown) {
  return sha256(stableStringify(value));
}

export function randomToken(bytes = 32) {
  return randomBytes(bytes).toString("base64url");
}

