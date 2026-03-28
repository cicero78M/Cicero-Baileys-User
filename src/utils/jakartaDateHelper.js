const JAKARTA_TIMEZONE = "Asia/Jakarta";

const jakartaIsoDateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: JAKARTA_TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const jakartaTimeFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: JAKARTA_TIMEZONE,
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

function normalizeDateInput(value) {
  const date = value instanceof Date ? value : new Date(value ?? Date.now());
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date;
}

export function formatJakartaIsoDate(value = new Date()) {
  const normalizedDate = normalizeDateInput(value);
  if (!normalizedDate) {
    return null;
  }
  return jakartaIsoDateFormatter.format(normalizedDate);
}

export function formatJakartaTime(value = new Date(), separator = ":") {
  const normalizedDate = normalizeDateInput(value);
  if (!normalizedDate) {
    return null;
  }

  const formatted = jakartaTimeFormatter.format(normalizedDate);
  return separator === ":" ? formatted : formatted.replace(":", separator);
}
