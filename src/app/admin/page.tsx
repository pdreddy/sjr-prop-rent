import { redirect } from "next/navigation";
import { getAuthedAdmin } from "@/lib/auth";
import AdminDashboard from "@/components/admin/AdminDashboard";

export default async function AdminPage() {
  const admin = await getAuthedAdmin();
  if (!admin) {
    redirect("/admin/login");
  }
  if (admin.role === "SECURITY") {
    redirect("/admin/electricity");
  }

  return <AdminDashboard username={admin.username} />;
}
