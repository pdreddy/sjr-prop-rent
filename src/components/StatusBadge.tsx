type Status = "PAID" | "UNPAID" | "PARTIAL" | "VACANT";

const STYLES: Record<Status, string> = {
  PAID: "bg-paid-bg text-paid",
  UNPAID: "bg-unpaid-bg text-unpaid",
  PARTIAL: "bg-partial-bg text-partial",
  VACANT: "bg-vacant-bg text-vacant",
};

const LABELS: Record<Status, string> = {
  PAID: "Paid",
  UNPAID: "Unpaid",
  PARTIAL: "Partial",
  VACANT: "Vacant",
};

export default function StatusBadge({ status }: { status: Status }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-3 py-1 text-sm font-semibold ${STYLES[status]}`}
    >
      {LABELS[status]}
    </span>
  );
}
