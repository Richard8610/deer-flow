import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  createCustomSkill,
  deleteCustomSkill,
  enableSkill,
  getCustomSkill,
  listCustomSkills,
  SkillRequestError,
  updateCustomSkill,
} from "./api";

import { loadSkills } from ".";

export function useSkills() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["skills"],
    queryFn: () => loadSkills(),
    retry: (count, err) => !(err instanceof SkillRequestError) && count < 3,
  });
  return { skills: data ?? [], isLoading, error };
}

export function useEnableSkill() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      skillName,
      enabled,
    }: {
      skillName: string;
      enabled: boolean;
    }) => {
      await enableSkill(skillName, enabled);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["skills"] });
    },
  });
}

export function useCustomSkills() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["skills", "custom"],
    queryFn: () => listCustomSkills(),
  });
  return { customSkills: data ?? [], isLoading, error };
}

export function useCustomSkill(name: string | null) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["skills", "custom", name],
    queryFn: () => getCustomSkill(name!),
    enabled: !!name,
  });
  return { skill: data ?? null, isLoading, error };
}

export function useCreateCustomSkill() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ name, content }: { name: string; content: string }) =>
      createCustomSkill(name, content),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["skills", "custom"] });
      void queryClient.invalidateQueries({ queryKey: ["skills"] });
    },
  });
}

export function useUpdateCustomSkill() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ name, content }: { name: string; content: string }) =>
      updateCustomSkill(name, content),
    onSuccess: (_data, { name }) => {
      void queryClient.invalidateQueries({ queryKey: ["skills", "custom"] });
      void queryClient.invalidateQueries({ queryKey: ["skills", "custom", name] });
      void queryClient.invalidateQueries({ queryKey: ["skills"] });
    },
  });
}

export function useDeleteCustomSkill() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => deleteCustomSkill(name),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["skills", "custom"] });
      void queryClient.invalidateQueries({ queryKey: ["skills"] });
    },
  });
}