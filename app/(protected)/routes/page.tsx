import { RoleGuard } from "@/components/auth/RoleGuard";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { RoutesPage } from "@/components/orders/RoutesPage";

export default function RoutesRoutePage() {
  return (
    <RoleGuard allow={["sender", "receiver", "admin"]}>
      <DashboardShell
        title="Routes"
        subtitle="Compare possible delivery routes by estimated cost before selecting a path."
      >
        <RoutesPage />
      </DashboardShell>
    </RoleGuard>
  );
}
