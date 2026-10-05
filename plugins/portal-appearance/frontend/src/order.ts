export type Tab = { id: string; label: string; href: string };
export function parseOrder(raw: string | null): string[] {
  try {
    const value = JSON.parse(raw || "[]");
    return Array.isArray(value)
      ? [...new Set(value.filter((x) => typeof x === "string"))]
      : [];
  } catch {
    return [];
  }
}
export function orderedTabs(tabs: Tab[], order: string[]): Tab[] {
  return [...tabs].sort(
    (a, b) =>
      (order.includes(a.id)
        ? order.indexOf(a.id)
        : order.length + tabs.indexOf(a)) -
      (order.includes(b.id)
        ? order.indexOf(b.id)
        : order.length + tabs.indexOf(b))
  );
}
export function move(order: string[], from: string, to: string): string[] {
  if (from === to || !order.includes(from) || !order.includes(to)) return order;
  const next = order.filter((x) => x !== from);
  next.splice(order.indexOf(to), 0, from);
  return next;
}
