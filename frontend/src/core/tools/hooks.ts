import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { createTool, deleteTool, listToolGroups, listTools, updateTool } from "./api";
import type { CreateToolRequest, UpdateToolRequest } from "./types";

export function useTools() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["tools"],
    queryFn: listTools,
  });
  return { tools: data ?? [], isLoading, error };
}

export function useToolGroups() {
  const { data, isLoading } = useQuery({
    queryKey: ["toolGroups"],
    queryFn: listToolGroups,
  });
  return { toolGroups: data ?? [], isLoading };
}

export function useCreateTool() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (request: CreateToolRequest) => createTool(request),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["tools"] });
    },
  });
}

export function useUpdateTool() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ name, request }: { name: string; request: UpdateToolRequest }) =>
      updateTool(name, request),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["tools"] });
    },
  });
}

export function useDeleteTool() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => deleteTool(name),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["tools"] });
    },
  });
}