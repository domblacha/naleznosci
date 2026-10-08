export type EscalationThresholds = readonly [number, number, number, number];

export const DEFAULT_THRESHOLDS: EscalationThresholds = [3, 7, 14, 30];

export type EscalationGroup = "stage_4" | "stage_3" | "stage_2" | "stage_1" | "pre_threshold" | "current" | "paused";

export const GROUP_ORDER: readonly EscalationGroup[] = [
  "stage_4",
  "stage_3",
  "stage_2",
  "stage_1",
  "pre_threshold",
  "current",
  "paused",
];

const MS_PER_DAY = 86_400_000;

const warsawDateFormat = new Intl.DateTimeFormat("en-US", {
  timeZone: "Europe/Warsaw",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function todayInPoland(now: Date): string {
  const parts = warsawDateFormat.formatToParts(now);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

// Liczone na datach kalendarzowych w UTC, więc zmiana czasu nie przesuwa wyniku.
function isoDateToUtcDay(iso: string): number {
  const [year, month, day] = iso.split("-").map(Number);
  return Date.UTC(year, month - 1, day) / MS_PER_DAY;
}

export function daysOverdue(dueDate: string, today: string): number {
  return isoDateToUtcDay(today) - isoDateToUtcDay(dueDate);
}

export function escalationGroup(days: number, thresholds: EscalationThresholds = DEFAULT_THRESHOLDS): EscalationGroup {
  const [t1, t2, t3, t4] = thresholds;
  if (days <= 0) return "current";
  if (days >= t4) return "stage_4";
  if (days >= t3) return "stage_3";
  if (days >= t2) return "stage_2";
  if (days >= t1) return "stage_1";
  return "pre_threshold";
}

/** An item with a non-empty `pausedOn` has no stage: it goes to the "paused" group, still with `daysOverdue`. */
export function groupInvoices<T extends { dueDate: string; number: string; pausedOn?: string | null }>(
  items: T[],
  today: string,
  thresholds: EscalationThresholds = DEFAULT_THRESHOLDS,
): { group: EscalationGroup; items: (T & { daysOverdue: number })[] }[] {
  const sorted = [...items].sort(
    (a, b) => a.dueDate.localeCompare(b.dueDate) || a.number.localeCompare(b.number, "pl", { numeric: true }),
  );

  const buckets = new Map<EscalationGroup, (T & { daysOverdue: number })[]>();
  for (const item of sorted) {
    const days = daysOverdue(item.dueDate, today);
    const group = item.pausedOn ? "paused" : escalationGroup(days, thresholds);
    const bucket = buckets.get(group) ?? [];
    bucket.push({ ...item, daysOverdue: days });
    buckets.set(group, bucket);
  }

  return GROUP_ORDER.flatMap((group) => {
    const groupItems = buckets.get(group);
    return groupItems ? [{ group, items: groupItems }] : [];
  });
}
