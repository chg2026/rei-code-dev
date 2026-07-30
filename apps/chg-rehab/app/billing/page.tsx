import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function BillingPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "Admin") redirect("/");

  // Keep the historic /billing entry point stable while sending admins to
  // CHG's authoritative same-origin billing workflow. The legacy client used
  // retired Gold Bridge contracts and failed cross-origin in production.
  redirect("/admin?panel=billing");
}
