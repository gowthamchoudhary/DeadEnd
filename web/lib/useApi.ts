"use client";

/** SWR data layer: typed keys, error/loading states, 401 handling.
 * Components use `useMeGuard()` for auth redirect, `swr(key, fn)` inline
 * elsewhere with SWR's built-in loading/error pattern. */
import useSWR, { SWRConfiguration } from "swr";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { api, UnauthorizedError, MeResp } from "./api";

export { api } from "./api";
export type { MeResp } from "./api";

const REFRESH = { refreshInterval: 15000, revalidateOnFocus: true } satisfies SWRConfiguration;

export function useMe(opts?: { redirectOn401?: string }) {
  const router = useRouter();
  const { data, error, isLoading, mutate } = useSWR<MeResp, Error>(
    "me", api.me, { shouldRetryOnError: false, ...REFRESH });

  useEffect(() => {
    if (error instanceof UnauthorizedError && opts?.redirectOn401) {
      router.replace(`${opts.redirectOn401}?next=${encodeURIComponent(location.pathname)}`);
    }
  }, [error, opts?.redirectOn401, router]);

  return { me: data, loading: isLoading, error, mutate, unauthorized: error instanceof UnauthorizedError };
}
