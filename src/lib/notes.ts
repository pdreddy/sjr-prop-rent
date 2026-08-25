// Matches a previously auto-generated "Paid electricity: ₹123" prefix so it can be
// recomputed instead of accumulating stale copies across edits.
const ELECTRICITY_NOTE_REGEX = /^Paid electricity:\s*₹[\d,.]+\s*(?:·\s*)?/i;

export function stripElectricityNote(notes: string | null | undefined): string {
  return (notes ?? "").replace(ELECTRICITY_NOTE_REGEX, "").trim();
}

export function withElectricityNote(notes: string | null | undefined, excessAmount: number): string | null {
  const rest = stripElectricityNote(notes);
  if (excessAmount > 0) {
    return `Paid electricity: ₹${excessAmount.toFixed(0)}${rest ? ` · ${rest}` : ""}`;
  }
  return rest || null;
}
