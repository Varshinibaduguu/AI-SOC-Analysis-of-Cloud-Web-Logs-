/** True when fetch/stream was cancelled via AbortController (e.g. React unmount). */
export function isAbortError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { name?: string; message?: string };
  return (
    e.name === "AbortError" ||
    (typeof e.message === "string" && e.message.toLowerCase().includes("abort"))
  );
}
