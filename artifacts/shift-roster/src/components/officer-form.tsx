import React from "react";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Officer, CreateOfficerBody } from "@workspace/api-client-react";

const officerSchema = z.object({
  callSign: z.string().min(1, "Call Sign is required"),
  citizenId: z.string().optional(),
  name: z.string().optional(),
  phoneNumber: z.string().optional(),
  department: z.string().min(1, "Department is required"),
  rank: z.string().min(1, "Rank is required"),
  division: z.string().optional(),
  status: z.string().min(1, "Status is required"),
  timezone: z.string().optional(),
  dateOfJoining: z.string().optional(),
  lastPromotion: z.string().optional(),
  pilot: z.boolean().optional(),
  mdt: z.boolean().optional(),
  seu: z.boolean().optional(),
  smg: z.boolean().optional(),
  rifle: z.boolean().optional(),
  shotgun: z.boolean().optional(),
  rifleTierII: z.boolean().optional(),
  ftp: z.boolean().optional(),
  strikesMajor: z.string().optional(),
  strikesMinor: z.string().optional(),
  discordUsername: z.string().optional(),
  discordUid: z.string().optional(),
  discordId: z.string().optional(),
  rockstarLicenseId: z.string().optional(),
  appointedFto: z.string().optional(),
  weekPeriod: z.string().optional(),
  dutyHours: z.string().optional(),
  completionStatus: z.string().optional(),
});

type OfficerFormValues = z.infer<typeof officerSchema>;

interface OfficerFormProps {
  defaultValues?: Partial<Officer>;
  onSubmit: (data: CreateOfficerBody) => void;
  isSubmitting?: boolean;
}

const QUAL_FIELDS: { key: keyof OfficerFormValues; label: string }[] = [
  { key: "pilot", label: "Pilot" },
  { key: "mdt", label: "MDT" },
  { key: "seu", label: "SEU" },
  { key: "smg", label: "SMG" },
  { key: "rifle", label: "Rifle" },
  { key: "shotgun", label: "Shotgun" },
  { key: "rifleTierII", label: "Rifle Tier II" },
  { key: "ftp", label: "FTP" },
];

export function OfficerForm({ defaultValues, onSubmit, isSubmitting }: OfficerFormProps) {
  const form = useForm<OfficerFormValues>({
    resolver: zodResolver(officerSchema),
    defaultValues: {
      callSign: defaultValues?.callSign ?? "",
      citizenId: defaultValues?.citizenId ?? "",
      name: defaultValues?.name ?? "",
      phoneNumber: defaultValues?.phoneNumber ?? "",
      department: defaultValues?.department ?? "SASP",
      rank: defaultValues?.rank ?? "CADET",
      division: defaultValues?.division ?? "",
      status: defaultValues?.status ?? "Active",
      timezone: defaultValues?.timezone ?? "BD",
      dateOfJoining: defaultValues?.dateOfJoining ?? "",
      lastPromotion: defaultValues?.lastPromotion ?? "",
      pilot: defaultValues?.pilot ?? false,
      mdt: defaultValues?.mdt ?? false,
      seu: defaultValues?.seu ?? false,
      smg: defaultValues?.smg ?? false,
      rifle: defaultValues?.rifle ?? false,
      shotgun: defaultValues?.shotgun ?? false,
      rifleTierII: defaultValues?.rifleTierII ?? false,
      ftp: defaultValues?.ftp ?? false,
      strikesMajor: defaultValues?.strikesMajor ?? "0/4",
      strikesMinor: defaultValues?.strikesMinor ?? "0/2",
      discordUsername: defaultValues?.discordUsername ?? "",
      discordUid: defaultValues?.discordUid ?? "",
      discordId: defaultValues?.discordId ?? "",
      rockstarLicenseId: defaultValues?.rockstarLicenseId ?? "",
      appointedFto: defaultValues?.appointedFto ?? "",
      weekPeriod: defaultValues?.weekPeriod ?? "",
      dutyHours: defaultValues?.dutyHours ?? "",
      completionStatus: defaultValues?.completionStatus ?? "",
    },
  });

  const handleSubmit = (values: OfficerFormValues) => {
    onSubmit({
      callSign: values.callSign,
      citizenId: values.citizenId || null,
      name: values.name || null,
      phoneNumber: values.phoneNumber || null,
      department: values.department,
      rank: values.rank,
      division: values.division || null,
      status: values.status,
      timezone: values.timezone || null,
      dateOfJoining: values.dateOfJoining || null,
      lastPromotion: values.lastPromotion || null,
      pilot: values.pilot ?? false,
      mdt: values.mdt ?? false,
      seu: values.seu ?? false,
      smg: values.smg ?? false,
      rifle: values.rifle ?? false,
      shotgun: values.shotgun ?? false,
      rifleTierII: values.rifleTierII ?? false,
      ftp: values.ftp ?? false,
      strikesMajor: values.strikesMajor || "0/4",
      strikesMinor: values.strikesMinor || "0/2",
      discordUsername: values.discordUsername || null,
      discordUid: values.discordUid || null,
      discordId: values.discordId || "",
      rockstarLicenseId: values.rockstarLicenseId || null,
      appointedFto: values.appointedFto || null,
      weekPeriod: values.weekPeriod || "",
      dutyHours: values.dutyHours || null,
      completionStatus: values.completionStatus || null,
    } as unknown as CreateOfficerBody);
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-5 max-h-[70vh] overflow-y-auto pr-1" data-testid="form-officer">
        {/* Row 1: Call Sign + Citizen ID + Phone */}
        <div className="grid grid-cols-3 gap-3">
          <FormField control={form.control} name="callSign" render={({ field }) => (
            <FormItem>
              <FormLabel className="text-xs">Call Sign *</FormLabel>
              <FormControl><Input placeholder="X-100" {...field} data-testid="input-callsign" /></FormControl>
              <FormMessage />
            </FormItem>
          )} />
          <FormField control={form.control} name="citizenId" render={({ field }) => (
            <FormItem>
              <FormLabel className="text-xs">Citizen ID</FormLabel>
              <FormControl><Input placeholder="205" {...field} /></FormControl>
            </FormItem>
          )} />
          <FormField control={form.control} name="phoneNumber" render={({ field }) => (
            <FormItem>
              <FormLabel className="text-xs">Phone</FormLabel>
              <FormControl><Input placeholder="449-3900" {...field} /></FormControl>
            </FormItem>
          )} />
        </div>

        {/* Row 2: Name + Division */}
        <div className="grid grid-cols-2 gap-3">
          <FormField control={form.control} name="name" render={({ field }) => (
            <FormItem>
              <FormLabel className="text-xs">Name</FormLabel>
              <FormControl><Input placeholder="Ricardo Lance" {...field} data-testid="input-name" /></FormControl>
            </FormItem>
          )} />
          <FormField control={form.control} name="division" render={({ field }) => (
            <FormItem>
              <FormLabel className="text-xs">Division</FormLabel>
              <FormControl><Input placeholder="High Command" {...field} /></FormControl>
            </FormItem>
          )} />
        </div>

        {/* Row 3: Department + Rank + Status */}
        <div className="grid grid-cols-3 gap-3">
          <FormField control={form.control} name="department" render={({ field }) => (
            <FormItem>
              <FormLabel className="text-xs">Department *</FormLabel>
              <Select onValueChange={field.onChange} value={field.value}>
                <FormControl><SelectTrigger data-testid="select-department"><SelectValue /></SelectTrigger></FormControl>
                <SelectContent>
                  {["SASP","BCSO","SAHP","PTA","IA","SWAT","FIB","Game Wardens","Management","FTP"].map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )} />
          <FormField control={form.control} name="rank" render={({ field }) => (
            <FormItem>
              <FormLabel className="text-xs">Rank *</FormLabel>
              <Select onValueChange={field.onChange} value={field.value}>
                <FormControl><SelectTrigger data-testid="input-rank"><SelectValue /></SelectTrigger></FormControl>
                <SelectContent>
                  {["CHIEF","ASSISTANT CHIEF","SHERIFF","COLONEL","SENIOR DEPUTY CHIEF","UNDERSHERIFF","ASSISTANT COLONEL","DEPUTY CHIEF","ASSISTANT SHERIFF","DEPUTY COLONEL","CAPTAIN","LIEUTENANT","SERGEANT FIRST CLASS","SERGEANT","CORPORAL","SENIOR TROOPER","SENIOR DEPUTY","SENIOR STATE TROOPER","TROOPER FIRST CLASS","DEPUTY FIRST CLASS","STATE TROOPER FIRST CLASS","TROOPER","DEPUTY","STATE TROOPER","PROBATIONARY OFFICER","CADET","TRAINEE"].map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )} />
          <FormField control={form.control} name="status" render={({ field }) => (
            <FormItem>
              <FormLabel className="text-xs">Status *</FormLabel>
              <Select onValueChange={field.onChange} value={field.value}>
                <FormControl><SelectTrigger data-testid="select-status"><SelectValue /></SelectTrigger></FormControl>
                <SelectContent>
                  {["Active","LOA","Inactive","Suspended","Semi-Active"].map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )} />
        </div>

        {/* Row 4: TZ + Joining + Last Promotion */}
        <div className="grid grid-cols-3 gap-3">
          <FormField control={form.control} name="timezone" render={({ field }) => (
            <FormItem>
              <FormLabel className="text-xs">Timezone</FormLabel>
              <FormControl><Input placeholder="BD" {...field} /></FormControl>
            </FormItem>
          )} />
          <FormField control={form.control} name="dateOfJoining" render={({ field }) => (
            <FormItem>
              <FormLabel className="text-xs">Date of Joining</FormLabel>
              <FormControl><Input placeholder="12/01/2025" {...field} /></FormControl>
            </FormItem>
          )} />
          <FormField control={form.control} name="lastPromotion" render={({ field }) => (
            <FormItem>
              <FormLabel className="text-xs">Last Promotion</FormLabel>
              <FormControl><Input placeholder="01/20/2026" {...field} /></FormControl>
            </FormItem>
          )} />
        </div>

        {/* Qualifications */}
        <div>
          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Qualifications</div>
          <div className="grid grid-cols-4 gap-2">
            {QUAL_FIELDS.map(({ key, label }) => (
              <FormField key={key} control={form.control} name={key as any} render={({ field }) => (
                <FormItem className="flex items-center gap-2 space-y-0 bg-secondary/30 rounded-md px-2 py-1.5">
                  <FormControl>
                    <Checkbox
                      checked={field.value as boolean}
                      onCheckedChange={field.onChange}
                      data-testid={`check-${key}`}
                    />
                  </FormControl>
                  <FormLabel className="text-xs font-medium cursor-pointer">{label}</FormLabel>
                </FormItem>
              )} />
            ))}
          </div>
        </div>

        {/* Strikes */}
        <div className="grid grid-cols-2 gap-3">
          <FormField control={form.control} name="strikesMajor" render={({ field }) => (
            <FormItem>
              <FormLabel className="text-xs">Strikes (Major)</FormLabel>
              <FormControl><Input placeholder="0/4" {...field} /></FormControl>
            </FormItem>
          )} />
          <FormField control={form.control} name="strikesMinor" render={({ field }) => (
            <FormItem>
              <FormLabel className="text-xs">Strikes (Minor)</FormLabel>
              <FormControl><Input placeholder="0/2" {...field} /></FormControl>
            </FormItem>
          )} />
        </div>

        {/* Discord + License */}
        <div className="grid grid-cols-2 gap-3">
          <FormField control={form.control} name="discordUsername" render={({ field }) => (
            <FormItem>
              <FormLabel className="text-xs">Discord Username</FormLabel>
              <FormControl><Input placeholder="username" {...field} data-testid="input-discord" /></FormControl>
            </FormItem>
          )} />
          <FormField control={form.control} name="discordUid" render={({ field }) => (
            <FormItem>
              <FormLabel className="text-xs">Discord UID</FormLabel>
              <FormControl><Input placeholder="442421398913155092" {...field} /></FormControl>
            </FormItem>
          )} />
        </div>
        <FormField control={form.control} name="rockstarLicenseId" render={({ field }) => (
          <FormItem>
            <FormLabel className="text-xs">Rockstar License ID</FormLabel>
            <FormControl><Input placeholder="license:..." {...field} className="font-mono text-xs" /></FormControl>
          </FormItem>
        )} />

        <div className="flex justify-end gap-2 pt-2 sticky bottom-0 bg-background pb-1">
          <Button type="submit" disabled={isSubmitting} data-testid="button-submit-officer">
            {isSubmitting ? "Saving..." : "Save Officer"}
          </Button>
        </div>
      </form>
    </Form>
  );
}
