const KMH_TO_MPH = 0.621371;

export const unitLabel = (units) => (units === "mph" ? "mph" : "km/h");

export function toUnit(kmh, units) {
  if (kmh === null || kmh === undefined) return null;
  return units === "mph" ? kmh * KMH_TO_MPH : kmh;
}

export function fmtSpeed(kmh, units, digits = 0) {
  const value = toUnit(kmh, units);
  if (value === null) return "–";
  return value.toFixed(digits);
}

export function fmtClock(seconds) {
  if (seconds === null || seconds === undefined) return "–";
  const s = Math.max(0, Math.round(seconds));
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  const pad = (n) => String(n).padStart(2, "0");
  return h > 0 ? h + ":" + pad(m % 60) + ":" + pad(s % 60) : m + ":" + pad(s % 60);
}

export function fmtDate(epoch) {
  if (!epoch) return "–";
  return new Date(epoch * 1000).toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export const titleCase = (text) => (text ? text.charAt(0).toUpperCase() + text.slice(1) : "");

export const directionLabel = (direction) =>
  ({ toward: "Towards camera", away: "Away from camera" }[direction] || "Unclear");

export const statusLabel = (status) =>
  ({
    running: "Running",
    completed: "Completed",
    stopped: "Stopped",
    failed: "Failed",
    interrupted: "Interrupted",
  }[status] || titleCase(status));
