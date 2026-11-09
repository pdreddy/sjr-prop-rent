/** ₹1,23,456 style (Indian grouping), up to 2 decimals, no trailing zeros. */
export const rupee = (n: number): string => `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

/** "Nov 2026" */
export function shortMonth(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });
}
