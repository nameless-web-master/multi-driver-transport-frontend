import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const MILESTONES = [
  "H3 Conversion & Driver Zones",
  "Zone Overlap & Adjacency",
  "Driver-Zone Graph Builder",
  "Pickup/Drop-off Detection",
  "Segment Cost & Route Cost",
  "Transfer Zone & Segments",
  "Route Visualization",
];

interface MilestoneProgressCardProps {
  current: number;
  total: number;
}

export function MilestoneProgressCard({ current, total }: MilestoneProgressCardProps) {
  const pct = Math.round((current / total) * 100);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Milestone Progress</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <div className="flex items-center justify-between text-sm mb-2">
            <span className="text-muted-foreground">Overall progress</span>
            <span className="font-semibold text-primary">
              {current}/{total}
            </span>
          </div>
          <div className="h-2.5 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full rounded-full bg-primary transition-all"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
        <ul className="space-y-2">
          {MILESTONES.map((label, i) => {
            const step = i + 1;
            const done = step < current;
            const active = step === current;
            return (
              <li key={label} className="flex items-center gap-2 text-sm">
                <span
                  className={`h-2 w-2 rounded-full shrink-0 ${
                    done ? "bg-success" : active ? "bg-primary" : "bg-border"
                  }`}
                />
                <span
                  className={
                    active
                      ? "font-medium text-foreground"
                      : done
                        ? "text-muted-foreground line-through"
                        : "text-muted-foreground"
                  }
                >
                  {label}
                </span>
                {active && (
                  <span className="ml-auto text-[10px] uppercase tracking-wide text-primary font-semibold">
                    Active
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}
