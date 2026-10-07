import { allUnits } from "../src/lib/store";
import { BUILDING_READY_MONTH } from "../src/lib/constants";
import { dbPrefix } from "../src/lib/firebase";
import { firstRentMonth, isBeforeBuildingOpened } from "../src/lib/month";

// Read-only data check: `npm run db:check`. Lists tenants whose move-in date looks wrong
// (before the building opened, e.g. 2016 typed for 2026, or missing), with their first rent month.
// Reads the FIREBASE_DB_PREFIX copy when it is set, otherwise the live data.
async function main() {
  const units = (await allUnits()).filter((u) => u.active && u.tenantName?.trim());
  console.log(`Checking ${units.length} tenants in ${dbPrefix() ? `/${dbPrefix()} (test copy)` : "live data"}; building opened ${BUILDING_READY_MONTH}.`);
  let problems = 0;
  for (const u of units) {
    const date = u.moveInDate?.toISOString().slice(0, 10) ?? null;
    if (!date) { problems++; console.log(`  ! Plot ${u.plotNumber} (${u.tenantName}): no move-in date`); }
    else if (isBeforeBuildingOpened(u.moveInDate)) { problems++; console.log(`  ! Plot ${u.plotNumber} (${u.tenantName}): move-in ${date} is before the building opened - wrong year? (rent would start ${firstRentMonth(u.moveInDate)})`); }
  }
  console.log(problems ? `${problems} tenant(s) need a move-in date fix (Overview > the plot's info button).` : "All move-in dates look fine.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
