import { addDays } from '../lib/dates.mjs';

const WEEKDAY_INDEX = new Map([
  ['Sunday', 0],
  ['Monday', 1],
  ['Tuesday', 2],
  ['Wednesday', 3],
  ['Thursday', 4],
  ['Friday', 5],
  ['Saturday', 6],
]);

export const tzDateParts = (date = new Date(), timeZone = 'Australia/Sydney') => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'long',
  }).formatToParts(date);

  const lookup = (type) => parts.find((part) => part.type === type)?.value;
  return {
    date: `${lookup('year')}-${lookup('month')}-${lookup('day')}`,
    weekday: lookup('weekday'),
  };
};

export const sundayLearningWindow = (date = new Date(), timeZone = 'Australia/Sydney') => {
  const local = tzDateParts(date, timeZone);
  const offset = WEEKDAY_INDEX.get(local.weekday);
  const weekEnd = addDays(local.date, -offset);
  return {
    runDate: local.date,
    weekStart: addDays(weekEnd, -6),
    weekEnd,
    timeZone,
  };
};
