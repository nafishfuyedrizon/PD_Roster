import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

export interface SiteSettings {
  org_name: string;
  org_acronym: string;
  org_subtitle: string;
  departments: string[];
  divisions: string[];
  ranks: string[];
}

const DEFAULT: SiteSettings = {
  org_name: "Police Department",
  org_acronym: "PD",
  org_subtitle: "Shift Roster",
  departments: ["SASP","BCSO","SAHP","IA","FTP","Management","SWAT","FIB","Game Wardens"],
  divisions: [
    "High Command","Low Command (HR)","Field Training Supervisor",
    "Field Training Officer","Field Training Trainee","Training Academy",
  ],
  ranks: [
    "CHIEF","ASSISTANT CHIEF","SHERIFF","COLONEL",
    "SENIOR DEPUTY CHIEF","UNDERSHERIFF","ASSISTANT COLONEL",
    "DEPUTY CHIEF","ASSISTANT SHERIFF","DEPUTY COLONEL",
    "CAPTAIN","LIEUTENANT","SERGEANT FIRST CLASS","SERGEANT","CORPORAL",
    "SENIOR STATE TROOPER","SENIOR TROOPER","SENIOR DEPUTY",
    "STATE TROOPER FIRST CLASS","TROOPER FIRST CLASS","DEPUTY FIRST CLASS",
    "STATE TROOPER","TROOPER","DEPUTY","CADET","TRAINEE","RECRUIT",
  ],
};

export function useSettings() {
  return useQuery<SiteSettings>({
    queryKey: ["settings"],
    queryFn: () => fetch("/api/settings").then((r) => r.json()),
    staleTime: 1000 * 60 * 5,
    placeholderData: DEFAULT,
  });
}

export function useUpdateSetting() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ key, value }: { key: string; value: unknown }) => {
      const res = await fetch("/api/admin/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key, value }),
      });
      if (!res.ok) throw new Error("Failed to save setting");
      return res.json();
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["settings"] }); },
  });
}
