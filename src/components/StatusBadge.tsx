type Status = "PAID" | "UNPAID" | "PARTIAL" | "VACANT" | "NA";

const STYLES: Record<Status, string> = {
  PAID: "bg-paid-bg text-paid",
  UNPAID: "bg-unpaid-bg text-unpaid",
  PARTIAL: "bg-partial-bg text-partial",
  VACANT: "bg-vacant-bg text-vacant",
  NA: "bg-vacant-bg text-vacant",
};

const DOT: Record<Status, string> = {
  PAID: "bg-paid",
  UNPAID: "bg-unpaid",
  PARTIAL: "bg-partial",
  VACANT: "bg-vacant",
  NA: "bg-vacant",
};

const LABELS: Record<Status, string> = {
  PAID: "Paid",
  UNPAID: "Unpaid",
  PARTIAL: "Partial",
  VACANT: "Vacant",
  NA: "N/A",
};

export default function StatusBadge({ status }: { status: Status }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-semibold ${STYLES[status]}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${DOT[status]}`} aria-hidden="true" />
      {LABELS[status]}
    </span>
  );
}
