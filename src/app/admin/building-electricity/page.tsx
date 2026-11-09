import { redirect } from "next/navigation";
import { getAuthedAdmin } from "@/lib/auth";
import ElectricityBill from "@/components/admin/ElectricityBill";

export default async function ElectricityPage() {
  const admin = await getAuthedAdmin();
  if (!admin) redirect("/admin/login");
  if (admin.role !== "ADMIN") redirect("/admin/electricity");
  return <ElectricityBill />;
}
