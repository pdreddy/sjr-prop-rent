import { redirect } from "next/navigation";
import { getAuthedAdmin } from "@/lib/auth";
import ElectricityDashboard from "@/components/admin/ElectricityDashboard";

export default async function AdminElectricityPage() {
  const admin = await getAuthedAdmin();
  if (!admin) {
    redirect("/admin/login");
  }

  return <ElectricityDashboard username={admin.username} role={admin.role} />;
}
