export function serializeBigInt<T>(value: T): T {
  return JSON.parse(JSON.stringify(value, (_, v) => (typeof v === "bigint" ? v.toString() : v)));
}

export function compactUser(user: { id: string; name: string; email: string } | null | undefined) {
  return user ? { id: user.id, name: user.name, email: user.email } : null;
}

