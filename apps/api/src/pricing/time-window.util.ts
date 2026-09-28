import { localParts } from '../common/timezone';

interface TimeWindowRule {
  daysOfWeek: number[];
  startTime: string | null;
  endTime: string | null;
}

function parseHHmm(value: string): number {
  const [h, m] = value.split(':').map(Number);
  return h * 60 + m;
}

export function matchesDayAndTime(rule: TimeWindowRule, at: Date): boolean {
  const local = localParts(at);
  if (rule.daysOfWeek.length > 0 && !rule.daysOfWeek.includes(local.day)) return false;
  if (!rule.startTime || !rule.endTime) return true;

  const start = parseHHmm(rule.startTime);
  const end = parseHHmm(rule.endTime);
  const now = local.minutes;

  // Janela que passa da meia-noite (ex.: 18:00–00:00 ou 00:00–06:00 tratado como início do dia seguinte)
  if (start <= end) return now >= start && now < end;
  return now >= start || now < end;
}

export function matchesDateRange(range: { startDate: Date | null; endDate: Date | null }, at: Date): boolean {
  if (range.startDate && at < range.startDate) return false;
  if (range.endDate && at > range.endDate) return false;
  return true;
}
