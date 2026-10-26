export const API = import.meta.env.VITE_API_URL || "http://localhost:8000";

export const url = (path) => API + path;

async function request(path, options = {}) {
  let res;
  try {
    res = await fetch(API + path, options);
  } catch (err) {
    throw new Error("Can't reach the backend. Start it with ./start.sh, then refresh this page.");
  }
  if (!res.ok) {
    let message = "Something went wrong (" + res.status + ").";
    try {
      const body = await res.json();
      if (typeof body.detail === "string") message = body.detail;
      else if (body.detail) message = "Check the values you entered and try again.";
    } catch (err) {
      /* keep the generic message */
    }
    throw new Error(message);
  }
  if (res.status === 204) return null;
  return res.json();
}

const json = (method, body) => ({
  method,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

const query = (params) => {
  const parts = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null && v !== "" && v !== false)
    .map(([k, v]) => encodeURIComponent(k) + "=" + encodeURIComponent(v));
  return parts.length ? "?" + parts.join("&") : "";
};

export const api = {
  health: () => request("/api/health"),
  overview: () => request("/api/overview"),

  videos: () => request("/api/videos"),
  video: (id) => request("/api/videos/" + id),
  renameVideo: (id, name) => request("/api/videos/" + id, json("PATCH", { name })),
  deleteVideo: (id) => request("/api/videos/" + id, { method: "DELETE" }),
  saveCalibration: (id, points, width_m, length_m) =>
    request("/api/videos/" + id + "/calibration", json("PUT", { points, width_m, length_m })),
  clearCalibration: (id) => request("/api/videos/" + id + "/calibration", { method: "DELETE" }),

  runs: (params = {}) => request("/api/runs" + query(params)),
  run: (id) => request("/api/runs/" + id),
  startRun: (video_id, extra = {}) => request("/api/runs", json("POST", { video_id, ...extra })),
  stopRun: (id) => request("/api/runs/" + id + "/stop", { method: "POST" }),
  replay: (id) => request("/api/runs/" + id + "/replay"),
  deleteRun: (id) => request("/api/runs/" + id, { method: "DELETE" }),

  vehicles: (params = {}) => request("/api/vehicles" + query(params)),
  vehicle: (id) => request("/api/vehicles/" + id),
  analytics: (params = {}) => request("/api/analytics" + query(params)),
  exportUrl: (params = {}) => API + "/api/export.csv" + query(params),

  settings: () => request("/api/settings"),
  saveSettings: (values) => request("/api/settings", json("PUT", values)),
  reset: () => request("/api/reset", json("POST", { confirm: true })),
};

export function uploadVideo(file, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", API + "/api/videos");
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && onProgress) onProgress(event.loaded / event.total);
    };
    xhr.onerror = () =>
      reject(new Error("Can't reach the backend. Start it with ./start.sh, then try again."));
    xhr.onload = () => {
      let body = null;
      try {
        body = JSON.parse(xhr.responseText);
      } catch (err) {
        /* not json */
      }
      if (xhr.status >= 200 && xhr.status < 300) resolve(body);
      else reject(new Error((body && typeof body.detail === "string" && body.detail) || "The upload failed."));
    };
    const form = new FormData();
    form.append("file", file);
    xhr.send(form);
  });
}
