import { matchesDayAndTime } from '../src/pricing/time-window.util';

// Sempre em horário de Brasília (-03:00), independente do fuso da máquina que roda o teste.
function at(hh: number, mm: number) {
  return new Date(`2026-01-04T${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:00-03:00`);
}

describe('matchesDayAndTime', () => {
  it('matches a normal same-day window', () => {
    const rule = { daysOfWeek: [], startTime: '06:00', endTime: '13:00' };
    expect(matchesDayAndTime(rule, at(9, 0))).toBe(true);
    expect(matchesDayAndTime(rule, at(13, 0))).toBe(false);
    expect(matchesDayAndTime(rule, at(5, 59))).toBe(false);
  });

  it('matches an overnight window that wraps past midnight', () => {
    const rule = { daysOfWeek: [], startTime: '18:00', endTime: '00:00' };
    expect(matchesDayAndTime(rule, at(23, 0))).toBe(true);
    expect(matchesDayAndTime(rule, at(17, 59))).toBe(false);
  });

  it('matches the madrugada window starting at midnight', () => {
    const rule = { daysOfWeek: [], startTime: '00:00', endTime: '06:00' };
    expect(matchesDayAndTime(rule, at(3, 0))).toBe(true);
    expect(matchesDayAndTime(rule, at(6, 0))).toBe(false);
  });

  it('respects a day-of-week restriction', () => {
    const sunday = new Date('2026-01-04T10:00:00-03:00'); // 2026-01-04 é domingo
    const monday = new Date('2026-01-05T10:00:00-03:00');
    const rule = { daysOfWeek: [1], startTime: null, endTime: null }; // só segunda-feira
    expect(matchesDayAndTime(rule, sunday)).toBe(false);
    expect(matchesDayAndTime(rule, monday)).toBe(true);
  });

  it('reads the clock in the business timezone even when the server runs in UTC', () => {
    // 21:30 em Brasília já é o dia seguinte em UTC: o horário de pico deve seguir Brasília.
    const rule = { daysOfWeek: [], startTime: '18:00', endTime: '22:00' };
    expect(matchesDayAndTime(rule, new Date('2026-01-05T00:30:00Z'))).toBe(true); // 21:30 em Brasília
    expect(matchesDayAndTime(rule, new Date('2026-01-05T02:00:00Z'))).toBe(false); // 23:00 em Brasília
    expect(matchesDayAndTime(rule, new Date('2026-01-05T20:59:00Z'))).toBe(false); // 17:59 em Brasília
  });
});
