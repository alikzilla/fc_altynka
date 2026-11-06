import { useQuery } from "@tanstack/react-query";
import { useCallback } from "react";
import { api, ApiError } from "../lib/api";
import { queryClient, resourceKey } from "../lib/queryClient";
import { useCommunityId } from '../state/community';

export function useResource<T>(path: string | null) {
  const communityId = useCommunityId();
  const key = resourceKey(path, communityId);
  const query = useQuery<T, ApiError>(
    {
      queryKey: key,
      enabled: !!path,
      queryFn: async ({ signal }) => {
        try {
          return await api.get<T>(path!, { communityId, signal });
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
        .cancelQueries({ queryKey: resourceKey(path, communityId) })
        .then(() => {
          const current = queryClient.getQueryData<T>(resourceKey(path, communityId));
          if (typeof data === "function" && current === undefined) return;
          queryClient.setQueryData<T>(
            resourceKey(path, communityId),
            typeof data === "function"
              ? (data as (current: T) => T)(current as T)
              : data,
          );
        });
    },
    [path, communityId],
  );
  return {
    data: path ? query.data : undefined,
    error: path && query.isError ? query.error : undefined,
    loading: !!path && query.isFetching,
    reload,
    replace,
  };
}
