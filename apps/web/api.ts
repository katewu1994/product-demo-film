let session = "";
export class ApiError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}
export async function api<T>(path: string, method = "GET", body?: unknown, key?: string): Promise<T> {
  for (let attempt = 0; attempt < 2; attempt++) {
    if (!session) {
      const response = await fetch("/api/v1/session", { cache: "no-store" });
      if (!response.ok) throw new Error("无法连接本地工作台");
      session = (await response.json()).session;
    }
    const res = await fetch(`/api/v1${path}`, {
      method,
      headers: {
        "x-productfilm-session": session,
        ...(body ? { "Content-Type": "application/json" } : {}),
        ...(key ? { "Idempotency-Key": key } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json();
    if (res.ok) return data as T;
    if (data.code === "invalid_session" && !attempt) {
      session = "";
      continue;
    }
    throw new ApiError(data.code, data.message || "请求失败");
  }
  throw new Error("无法建立本地会话");
}
