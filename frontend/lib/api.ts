const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";

const FIELD_LABELS: Record<string, string> = {
  connection_name: "Connection name",
  access_key_id: "Access Key ID",
  secret_access_key: "Secret Access Key",
  region: "Region",
  log_source: "Log source",
  log_group_name: "Log group name",
  session_token: "Session token",
};

function formatApiDetail(detail: unknown): string {
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    return detail
      .map((item) => {
        if (typeof item === "object" && item && "msg" in item) {
          const loc = (item as { loc?: (string | number)[] }).loc;
          const fieldKey = loc?.length ? String(loc[loc.length - 1]) : "";
          const label = FIELD_LABELS[fieldKey] || fieldKey;
          const msg = String((item as { msg: string }).msg);
          if (label) {
            if (fieldKey === "access_key_id" && msg.includes("at least")) {
              return `${label}: must be exactly 20 characters (e.g. AKIAIOSFODNN7EXAMPLE)`;
            }
            if (fieldKey === "secret_access_key" && msg.includes("at least")) {
              return `${label}: must be 40 characters (full secret from AWS IAM)`;
            }
            return `${label}: ${msg}`;
          }
          return msg;
        }
        return JSON.stringify(item);
      })
      .join("; ");
  }
  if (detail && typeof detail === "object" && "msg" in detail) {
    return String((detail as { msg: string }).msg);
  }
  return "";
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
  }
}

async function request<T>(
  path: string,
  options: RequestInit = {},
  token?: string | null
): Promise<T> {
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string>),
  };
  if (!(options.body instanceof FormData)) {
    headers["Content-Type"] = "application/json";
  }
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const url = `${API_URL}${path}`;
  let res: Response;
  try {
    res = await fetch(url, { ...options, headers });
  } catch (err) {
    const hint =
      options.body instanceof FormData
        ? " Upload may have timed out — try a smaller PDF (under 5MB) or wait for Render to wake up."
        : "";
    throw new Error(
      `Cannot reach API at ${url}.${hint} ` +
        (API_URL.includes("localhost")
          ? "On Vercel, set NEXT_PUBLIC_API_URL to your Render URL (…/api/v1) and redeploy."
          : "Ensure Render is live at /health, then retry.")
    );
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new ApiError(res.status, formatApiDetail(err.detail) || res.statusText);
  }
  if (res.status === 204) return {} as T;
  const contentType = res.headers.get("content-type");
  if (contentType?.includes("application/json")) {
    return res.json();
  }
  return res as unknown as T;
}

export const api = {
  get: <T>(path: string, token?: string | null) =>
    request<T>(path, { method: "GET" }, token),
  post: <T>(path: string, body: unknown, token?: string | null) =>
    request<T>(path, { method: "POST", body: JSON.stringify(body) }, token),
  upload: <T>(path: string, formData: FormData, token?: string | null) =>
    request<T>(path, { method: "POST", body: formData }, token),
};

export { API_URL };
