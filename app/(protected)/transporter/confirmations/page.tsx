import { RoleGuard } from "@/components/auth/RoleGuard";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { ConfirmationsPage } from "@/components/orders/ConfirmationsPage";

export default function TransporterConfirmationsRoutePage() {
  return (
    <RoleGuard allow={["driver", "admin"]}>
      <DashboardShell
        title="My shipments"
        subtitle="Respond to requests, set prices, and track your assigned deliveries."
      >
        <ConfirmationsPage />
      </DashboardShell>
    </RoleGuard>
  );
}
