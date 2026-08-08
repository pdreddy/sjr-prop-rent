import { redirect } from "next/navigation";
import { getAuthedAdmin } from "@/lib/auth";
import PlotDetailPage from "@/components/admin/PlotDetailPage";

export default async function PlotPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ month?: string }>;
}) {
  const admin = await getAuthedAdmin();
  if (!admin) {
    redirect("/admin/login");
  }

  const { id } = await params;
  const { month } = await searchParams;
  return <PlotDetailPage plotId={id} initialMonth={month} />;
}
