import { isHubMode, normalizeTransportMode } from "@/lib/transportMode";
import type { DriverZone } from "@/types";

export type SchedulePattern = "daily" | "weekly" | "monthly";

export const SCHEDULE_PATTERNS: { value: SchedulePattern; label: string }[] = [
  { value: "daily", label: "Every day" },
  { value: "weekly", label: "Days of the week" },
  { value: "monthly", label: "Days of the month" },
];

export const WEEKDAY_OPTIONS: { value: number; label: string }[] = [
  { value: 0, label: "Sunday" },
  { value: 1, label: "Monday" },
  { value: 2, label: "Tuesday" },
  { value: 3, label: "Wednesday" },
  { value: 4, label: "Thursday" },
  { value: 5, label: "Friday" },
  { value: 6, label: "Saturday" },
];

const HH_MM = /^([01]\d|2[0-3]):([0-5]\d)$/;
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

function parseScheduleTime(value: string | null | undefined): string | null {
  if (value == null) return null;
  const trimmed = String(value).trim();
  const match = /^([01]\d|2[0-3]):([0-5]\d)/.exec(trimmed);
  return match ? `${match[1]}:${match[2]}` : null;
}

function parseOperationDate(value: string | Date | null | undefined): string | null {
  if (value == null) return null;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return dateToYmd(value);
  }
  const trimmed = String(value).trim();
  const datePart = trimmed.slice(0, 10);
  if (!ISO_DATE.test(datePart)) return null;
  const d = new Date(`${datePart}T12:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  return datePart;
}

function parseSchedulePattern(value: string | null | undefined): SchedulePattern {
  const v = String(value ?? "daily").trim().toLowerCase();
  return v === "weekly" || v === "monthly" ? v : "daily";
}

function timeToMinutes(time: string): number | null {
  const match = HH_MM.exec(time.trim());
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

function isInCircularRange(value: number, start: number, end: number): boolean {
  if (start <= end) return value >= start && value <= end;
  return value >= start || value <= end;
}

function normalizeDateRange(zone: DriverZone): { start: string; end: string } | null {
  const start = parseOperationDate(zone.operation_start_date ?? zone.operation_date);
  const end = parseOperationDate(
    zone.operation_end_date ?? zone.operation_date ?? zone.operation_start_date
  );
  if (!start || !end || start > end) return null;
  return { start, end };
}

function getOperatingTimes(zone: DriverZone): { startTime: string | null; endTime: string | null } {
  const mode = normalizeTransportMode(zone.transport_mode);
  if (isHubMode(mode)) {
    return {
      startTime: parseScheduleTime(zone.departure_time),
      endTime: parseScheduleTime(zone.arrival_time),
    };
  }
  return {
    startTime: parseScheduleTime(zone.operating_start_time),
    endTime: parseScheduleTime(zone.operating_end_time),
  };
}

function dateToYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function isTimeWithinDailyWindow(now: Date, startTime: string, endTime: string): boolean {
  const startMin = timeToMinutes(startTime);
  const endMin = timeToMinutes(endTime);
  if (startMin == null || endMin == null) return false;
  const nowMin = now.getHours() * 60 + now.getMinutes();
  if (endMin > startMin) return nowMin >= startMin && nowMin < endMin;
  return nowMin >= startMin || nowMin < endMin;
}

function matchesDayPattern(zone: DriverZone, now: Date): boolean {
  const pattern = parseSchedulePattern(zone.schedule_pattern);
  if (pattern === "daily") return true;
  if (pattern === "weekly") {
    const ws = zone.weekday_start;
    const we = zone.weekday_end;
    if (ws == null || we == null) return false;
    return isInCircularRange(now.getDay(), ws, we);
  }
  const ms = zone.month_day_start;
  const me = zone.month_day_end;
  if (ms == null || me == null) return false;
  return isInCircularRange(now.getDate(), ms, me);
}

export function hasCompleteZoneSchedule(zone: DriverZone): boolean {
  if (!normalizeDateRange(zone)) return false;
  const { startTime, endTime } = getOperatingTimes(zone);
  if (!startTime || !endTime) return false;
  const pattern = parseSchedulePattern(zone.schedule_pattern);
  if (pattern === "weekly" && (zone.weekday_start == null || zone.weekday_end == null)) {
    return false;
  }
  if (pattern === "monthly" && (zone.month_day_start == null || zone.month_day_end == null)) {
    return false;
  }
  return true;
}

export function isZoneScheduleActive(zone: DriverZone, now: Date = new Date()): boolean {
  if (!hasCompleteZoneSchedule(zone)) return false;
  const range = normalizeDateRange(zone)!;
  const today = dateToYmd(now);
  if (today < range.start || today > range.end) return false;
  if (!matchesDayPattern(zone, now)) return false;
  const { startTime, endTime } = getOperatingTimes(zone);
  return isTimeWithinDailyWindow(now, startTime!, endTime!);
}

export function filterScheduleActiveZones(zones: DriverZone[], now: Date = new Date()): DriverZone[] {
  return zones.filter((z) => isZoneScheduleActive(z, now));
}

export function todayOperationDate(): string {
  return dateToYmd(new Date());
}

export function formatZoneScheduleLabel(zone: DriverZone): string | null {
  const range = normalizeDateRange(zone);
  if (!range) return null;
  const { startTime, endTime } = getOperatingTimes(zone);
  if (!startTime || !endTime) return null;

  const datePart =
    range.start === range.end ? range.start : `${range.start} → ${range.end}`;
  const timePart = `${startTime}–${endTime}`;
  const pattern = parseSchedulePattern(zone.schedule_pattern);

  let repeatPart = "every day";
  if (pattern === "weekly" && zone.weekday_start != null && zone.weekday_end != null) {
    const ws = WEEKDAY_OPTIONS.find((d) => d.value === zone.weekday_start)?.label ?? "?";
    const we = WEEKDAY_OPTIONS.find((d) => d.value === zone.weekday_end)?.label ?? "?";
    repeatPart = ws === we ? ws : `${ws}–${we}`;
  } else if (pattern === "monthly" && zone.month_day_start != null && zone.month_day_end != null) {
    repeatPart =
      zone.month_day_start === zone.month_day_end
        ? `day ${zone.month_day_start}`
        : `days ${zone.month_day_start}–${zone.month_day_end}`;
  }

  return `${datePart} · ${repeatPart} · ${timePart}`;
}
