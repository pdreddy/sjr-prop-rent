import { allPayments } from "../src/lib/store";
import { setDocument } from "../src/lib/firebase";
import { withElectricityNote } from "../src/lib/notes";

async function main() {
  const payments = await allPayments();
  let updated = 0;

  for (const payment of payments) {
    const expected = payment.rentAmount + payment.maintenanceAmount;
    const excessAmount = Math.max(0, payment.amountPaid - expected);
    const nextNotes = withElectricityNote(payment.notes, excessAmount);

    if (nextNotes !== (payment.notes ?? null)) {
      await setDocument(`payments/${payment.id}`, { notes: nextNotes, updatedAt: new Date() }, true);
      updated += 1;
      console.log(`${payment.id}: "${payment.notes ?? ""}" -> "${nextNotes ?? ""}"`);
    }
  }

  console.log(`Synced ${updated}/${payments.length} payment note(s).`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
