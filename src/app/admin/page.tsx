import { redirect } from "next/navigation";
import { getAuthedAdmin } from "@/lib/auth";
import AdminDashboard from "@/components/admin/AdminDashboard";

export default async function AdminPage() {
  const admin = await getAuthedAdmin();
  if (!admin) {
    redirect("/admin/login");
  }

  return <AdminDashboard username={admin.username} />;
}
