// Praat met /api. Fouten komen terug als {code, message}.

export class ApiError extends Error {
  constructor(status, body) {
    super(body?.message || `Fout ${status}`);
    this.status = status;
    this.code = body?.code || "error";
  }
}

async function call(method, path, body, isForm = false) {
  const opts = { method, credentials: "same-origin", headers: { "X-Roosters": "1" } };
  if (body !== undefined) {
    if (isForm) opts.body = body;
    else {
      opts.headers["Content-Type"] = "application/json";
      opts.body = JSON.stringify(body);
    }
  }
  let res;
  try {
    res = await fetch("/api" + path, opts);
  } catch {
    throw new ApiError(0, { code: "offline", message: "Geen verbinding met de server." });
  }
  let data = null;
  try { data = await res.json(); } catch { /* geen json */ }
  if (!res.ok) throw new ApiError(res.status, data);
  return data;
}

export const api = {
  get: (p) => call("GET", p),
  post: (p, b = {}) => call("POST", p, b),
  patch: (p, b = {}) => call("PATCH", p, b),
  del: (p) => call("DELETE", p),
  form: (p, fd) => call("POST", p, fd, true),
};
