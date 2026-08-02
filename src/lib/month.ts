const MONTH_REGEX = /^\d{4}-(0[1-9]|1[0-2])$/;

export function isValidMonth(month: string): boolean {
  return MONTH_REGEX.test(month);
}

export function getCurrentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export function getPreviousMonth(month: string): string {
  const [year, monthNum] = month.split("-").map(Number);
  const date = new Date(Date.UTC(year, monthNum - 1, 1));
  date.setUTCMonth(date.getUTCMonth() - 1);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function formatMonthLabel(month: string): string {
  if (!isValidMonth(month)) return month;
  const [year, monthNum] = month.split("-").map(Number);
  const date = new Date(Date.UTC(year, monthNum - 1, 1));
  return date.toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function formatDate(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

export function getMonthOptions(count = 24): string[] {
  const options: string[] = [];
  let month = getCurrentMonth();
  for (let i = 0; i < count; i++) {
    options.push(month);
    month = getPreviousMonth(month);
  }
  return options;
}
