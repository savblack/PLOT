// Wall-clock instants in US Eastern. Marketing scheduling uses this zone only.
// The offset is read from the zone, so daylight time and standard time both
// land on the same clock hour.

export const PUBLISH_TZ = 'America/New_York';
export const DEFAULT_PUBLISH_HOUR = 9;
export const DEFAULT_PUBLISH_MINUTE = 0;

/** A zone's UTC offset, in ms, at a given instant. */
export const offsetMsAt = (instant, timeZone) => {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'longOffset' })
    .formatToParts(instant);
  const name = parts.find((part) => part.type === 'timeZoneName')?.value ?? 'GMT+00:00';
  const match = /GMT([+-])(\d{2}):(\d{2})/.exec(name);
  if (!match) return 0;
  return (match[1] === '-' ? -1 : 1) * (Number(match[2]) * 60 + Number(match[3])) * 60_000;
};

/**
 * The UTC instant for a wall-clock time on a calendar day in a zone.
 * Looked up twice so the daylight-time changeover day itself is right.
 */
export const zonedInstant = (day, hour, minute, timeZone = PUBLISH_TZ) => {
  const [year, month, date] = day.split('-').map(Number);
  const wallClock = Date.UTC(year, month - 1, date, hour, minute, 0);
  let instant = wallClock - offsetMsAt(new Date(wallClock), timeZone);
  instant = wallClock - offsetMsAt(new Date(instant), timeZone);
  return new Date(instant);
};

/** 9:00am Eastern on a YYYY-MM-DD, unless an hour and minute are passed. */
export const etPublishInstant = (day, hour = DEFAULT_PUBLISH_HOUR, minute = DEFAULT_PUBLISH_MINUTE) =>
  zonedInstant(day, hour, minute, PUBLISH_TZ);
