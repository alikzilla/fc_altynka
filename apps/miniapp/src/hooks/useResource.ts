import { useQuery } from "@tanstack/react-query";
import { useCallback } from "react";
import { api, ApiError } from "../lib/api";
import { queryClient, resourceKey } from "../lib/queryClient";

export function useResource<T>(path: string | null) {
  const key = resourceKey(path);
  const query = useQuery<T, ApiError>(
    {
      queryKey: key,
      enabled: !!path,
      queryFn: async () => {
        try {
          return await api.get<T>(path!);
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
