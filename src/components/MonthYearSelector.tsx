"use client";

import { formatMonthLabel } from "@/lib/month";

interface Props {
  month: string;
  options: string[];
  onChange: (month: string) => void;
}

export default function MonthYearSelector({ month, options, onChange }: Props) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-sm font-medium text-primary-dark">Month</span>
      <select
        value={month}
        onChange={(e) => onChange(e.target.value)}
        aria-label="Select month and year"
        className="min-h-11 rounded-lg border border-primary/20 bg-white px-3 py-2 text-base text-foreground shadow-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
      >
        {options.map((opt) => (
          <option key={opt} value={opt}>
            {formatMonthLabel(opt)}
          </option>
        ))}
      </select>
    </label>
  );
}
