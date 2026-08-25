// Matches a previously auto-generated "Paid Electricity: ₹123" prefix (old lowercase
// "Paid electricity:" and " · " joins included) so it can be recomputed instead of
// accumulating stale copies across edits.
const ELECTRICITY_PREFIX_REGEX = /^paid electricity:\s*₹[\d,.]+\s*(?:\n|·\s*)?/i;

// A manually typed note that just restates "paid electricity" (with the common
// "Piad" typo) is redundant once we're already prefixing an auto-generated
// "Paid Electricity: ₹<amount>" note, so drop it instead of duplicating it.
const REDUNDANT_ELECTRICITY_REGEX = /^p[ai]{2}d\s+electricity$/i;

export function stripElectricityNote(notes: string | null | undefined): string {
  const rest = (notes ?? "").replace(ELECTRICITY_PREFIX_REGEX, "").trim();
  return REDUNDANT_ELECTRICITY_REGEX.test(rest) ? "" : rest;
}

export function withElectricityNote(notes: string | null | undefined, excessAmount: number): string | null {
  const rest = stripElectricityNote(notes);
  if (excessAmount > 0) {
    const prefix = `Paid Electricity: ₹${excessAmount.toFixed(0)}`;
    return rest ? `${prefix}\n${rest}` : prefix;
  }
  return rest || null;
}
