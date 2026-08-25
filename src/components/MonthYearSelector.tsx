"use client";

import { formatMonthLabel } from "@/lib/month";
import { IconCalendar } from "@/components/icons";

interface Props {
  month: string;
  options: string[];
  onChange: (month: string) => void;
}

export default function MonthYearSelector({ month, options, onChange }: Props) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-sm font-medium text-primary-dark">Month</span>
      <div className="relative">
        <IconCalendar className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-primary/50" />
        <select
          value={month}
          onChange={(e) => onChange(e.target.value)}
          aria-label="Select month and year"
          className="min-h-11 w-full appearance-none rounded-xl border border-primary/15 bg-white py-2 pl-9 pr-8 text-base text-foreground shadow-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
        >
          {options.map((opt) => (
            <option key={opt} value={opt}>
              {formatMonthLabel(opt)}
            </option>
          ))}
        </select>
        <svg viewBox="0 0 24 24" className="pointer-events-none absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-foreground/40" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="m6 9 6 6 6-6" />
        </svg>
      </div>
    </label>
  );
}
