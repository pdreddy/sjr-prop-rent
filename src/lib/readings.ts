// Parses pasted meter-reading text into per-plot readings. One plot per line; the plot
// number comes first, followed by either the current reading alone or "previous current".
// Separators can be spaces, commas, colons, "=", "-" or "→", so all of these work:
//   101: 1234        Plot 101 - 1234        101,1200,1234        101 1200 → 1234
export interface ParsedReading {
  line: number;
  plotNumber: string;
  prevReading: number | null; // null → keep the plot's existing previous reading
  currReading: number;
}
export interface ParseIssue {
  line: number;
  text: string;
  reason: string;
}

export function parseReadings(input: string): { readings: ParsedReading[]; issues: ParseIssue[] } {
  const readings: ParsedReading[] = [];
  const issues: ParseIssue[] = [];
  input.split(/\r?\n/).forEach((raw, index) => {
    const text = raw.trim();
    if (!text) return;
    const cleaned = text.replace(/^plot\b\.?/i, "").replace(/[,:=→>\-–—|\t]+/g, " ").trim();
    const tokens = cleaned.split(/\s+/).filter(Boolean);
    const [plotNumber, ...nums] = tokens;
    const values = nums.map(Number);
    if (!plotNumber || nums.length < 1 || nums.length > 2) {
      issues.push({ line: index + 1, text, reason: "Expected: plot number, then current reading (or previous and current)." });
      return;
    }
    if (values.some((v) => !Number.isFinite(v) || v < 0)) {
      issues.push({ line: index + 1, text, reason: "Readings must be non-negative numbers." });
      return;
    }
    const [prevReading, currReading] = values.length === 2 ? [values[0], values[1]] : [null, values[0]];
    if (prevReading !== null && currReading < prevReading) {
      issues.push({ line: index + 1, text, reason: "Current reading is lower than previous." });
      return;
    }
    readings.push({ line: index + 1, plotNumber, prevReading, currReading });
  });
  return { readings, issues };
}
