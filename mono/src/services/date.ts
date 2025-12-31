import { Temporal } from "temporal-polyfill";

export const timeFromNow = (timestamp: number = Date.now()) => {
  const now = Temporal.Now.instant();
  const past = Temporal.Instant.fromEpochMilliseconds(timestamp);
  const duration = now.since(past);

  const seconds = duration.total("seconds");
  const minutes = Math.floor(duration.total("minutes"));
  const hours = Math.floor(duration.total("hours"));
  const days = Math.floor(duration.total("days"));

  if (seconds < 60) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;

  const pastDateTime = past.toZonedDateTimeISO(Temporal.Now.timeZoneId());
  const nowDateTime = now.toZonedDateTimeISO(Temporal.Now.timeZoneId());
  const showYear = pastDateTime.year !== nowDateTime.year;

  return pastDateTime.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    ...(showYear && { year: "numeric" }),
  });
};
