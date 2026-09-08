import type { QueryClient, QueryKey } from "@tanstack/react-query";

/** Invalidate each query key separately (React Query matches by prefix per key). */
export function invalidateMany(
  queryClient: QueryClient,
  keys: QueryKey[]
): Promise<void[]> {
  return Promise.all(
    keys.map((queryKey) => queryClient.invalidateQueries({ queryKey }))
  );
}
