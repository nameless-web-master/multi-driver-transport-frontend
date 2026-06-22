import { RoleGuard } from "@/components/auth/RoleGuard";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { ConfirmationsPage } from "@/components/orders/ConfirmationsPage";

export default function TransporterConfirmationsRoutePage() {
  return (
    <RoleGuard allow={["driver", "admin"]}>
      <DashboardShell
        title="Confirmations"
        subtitle="Review and respond to segment confirmation requests on assigned routes."
      >
        <ConfirmationsPage />
      </DashboardShell>
    </RoleGuard>
  );
}
