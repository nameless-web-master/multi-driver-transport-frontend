import { RoleGuard } from "@/components/auth/RoleGuard";
import { ComingSoonPage } from "@/components/dashboard/ComingSoonPage";

export default function RoutesPage() {
  return (
    <RoleGuard allow={["sender", "admin"]}>
      <ComingSoonPage
        title="Routes"
        subtitle="Multi-driver path generation and route management."
        milestone={5}
      />
    </RoleGuard>
  );
}
