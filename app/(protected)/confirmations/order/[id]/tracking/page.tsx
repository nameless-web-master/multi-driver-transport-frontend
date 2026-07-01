import { RoleGuard } from "@/components/auth/RoleGuard";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { OrderTrackingPage } from "@/components/orders/OrderTrackingPage";

interface Props {
  params: { id: string };
}

export default function TransporterOrderTrackingRoutePage({ params }: Props) {
  const orderId = Number(params.id);

  return (
    <RoleGuard allow={["driver", "admin"]}>
      <DashboardShell
        title="Order tracking"
        subtitle="Live route visualization with segment confirmation states."
      >
        {Number.isInteger(orderId) && orderId > 0 ? (
          <OrderTrackingPage orderId={orderId} audience="transporter" />
        ) : (
          <p className="px-6 text-sm text-muted-foreground">Invalid order id.</p>
        )}
      </DashboardShell>
    </RoleGuard>
  );
}
