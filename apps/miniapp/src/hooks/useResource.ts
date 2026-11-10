import { useQuery } from "@tanstack/react-query";
import { useCallback } from "react";
import { api, ApiError } from "../lib/api";
import { queryClient, resourceKey } from "../lib/queryClient";

/** `alwaysRefresh`: refetch on every open, showing the cached copy meanwhile (data others may have just changed). */
export function useResource<T>(path: string | null, { alwaysRefresh = false }: { alwaysRefresh?: boolean } = {}) {
  const key = resourceKey(path);
  const query = useQuery<T, ApiError>(
    {
      queryKey: key,
      enabled: !!path,
      ...(alwaysRefresh ? { refetchOnMount: 'always' as const } : {}),
      queryFn: async ({ signal }) => {
        try {
          return await api.get<T>(path!, { signal });
        } catch (error) {
          throw error instanceof ApiError ? error : new ApiError(0, "network");
        }
      },
    },
    queryClient,
  );
  const { refetch } = query;
  const reload = useCallback(() => {
    void refetch();
  }, [refetch]);
  // A saved response supersedes any refresh still in flight, so cancel it before writing.
  const replace = useCallback(
    (data: T | ((current: T) => T)) => {
      if (!path) return;
      void queryClient
        .cancelQueries({ queryKey: resourceKey(path) })
        .then(() => {
          const current = queryClient.getQueryData<T>(resourceKey(path));
          if (typeof data === "function" && current === undefined) return;
          queryClient.setQueryData<T>(
            resourceKey(path),
            typeof data === "function"
              ? (data as (current: T) => T)(current as T)
              : data,
          );
        });
    },
    [path],
  );
  return {
    data: path ? query.data : undefined,
    error: path && query.isError ? query.error : undefined,
    loading: !!path && query.isFetching,
    reload,
    replace,
  };
}
