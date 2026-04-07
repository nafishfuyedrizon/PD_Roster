import React, { useEffect, useState } from "react";
import { z } from "zod";
import { useForm, useWatch } from "react-hook-form";
import { useSettings } from "@/hooks/useSettings";
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
  SelectSeparator,
} from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { CalendarIcon } from "lucide-react";
import { format, parse, isValid } from "date-fns";
import type { Officer, CreateOfficerBody } from "@workspace/api-client-react";

// Parses MM/DD/YYYY → Date, or returns undefined
function parseMDY(str: string | undefined | null): Date | undefined {
  if (!str) return undefined;
  const d = parse(str, "MM/dd/yyyy", new Date());
  return isValid(d) ? d : undefined;
}

// Formats Date → MM/DD/YYYY
function formatMDY(d: Date): string {
  return format(d, "MM/dd/yyyy");
}

function FormDatePicker({
  value,
  onChange,
  placeholder = "MM/DD/YYYY",
}: {
  value?: string;
  onChange: (val: string) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const selected = parseMDY(value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          type="button"
          className="w-full justify-start text-left font-mono text-xs h-9 px-3"
        >
          <CalendarIcon className="mr-2 h-3.5 w-3.5 text-muted-foreground shrink-0" />
          {value ? (
            <span>{value}</span>
          ) : (
            <span className="text-muted-foreground">{placeholder}</span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={selected}
          onSelect={(date) => {
            if (date) {
              onChange(formatMDY(date));
              setOpen(false);
            }
          }}
          defaultMonth={selected ?? new Date()}
          captionLayout="dropdown"
        />
      </PopoverContent>
    </Popover>
  );
}

function todayMDY(): string {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${mm}/${dd}/${d.getFullYear()}`;
}

const officerSchema = z.object({
  callSign: z.string().min(1, "Call Sign is required"),
  citizenId: z.string().optional(),
  name: z.string().min(1, "Name is required"),
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
  isManagement: z.boolean().optional(),
  strikesMajor: z.string().optional(),
  strikesMinor: z.string().optional(),
  discordUsername: z.string().optional(),
  discordUid: z.string().min(1, "Discord UID is required"),
  discordId: z.string().optional(),
  rockstarLicenseId: z.string().min(1, "Rockstar License ID is required"),
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

const DEPT_RANKS: Record<string, string[]> = {
  // Official SASP structure (image: Cadet → Chief)
  SASP: [
    "CHIEF","ASSISTANT CHIEF","SENIOR DEPUTY CHIEF","DEPUTY CHIEF",
    "CAPTAIN","LIEUTENANT","SERGEANT FIRST CLASS","SERGEANT","CORPORAL",
    "SENIOR TROOPER","TROOPER FIRST CLASS","TROOPER","CADET",
  ],
  // Official BCSO structure (image: Recruit → Sheriff)
  BCSO: [
    "SHERIFF","UNDERSHERIFF","ASSISTANT SHERIFF",
    "CAPTAIN","LIEUTENANT","SERGEANT FIRST CLASS","SERGEANT","CORPORAL",
    "SENIOR DEPUTY","DEPUTY FIRST CLASS","DEPUTY","RECRUIT",
  ],
  // Official SAHP structure (image: Cadet → Colonel)
  SAHP: [
    "COLONEL","ASSISTANT COLONEL","DEPUTY COLONEL",
    "CAPTAIN","LIEUTENANT","SERGEANT FIRST CLASS","SERGEANT","CORPORAL",
    "SENIOR STATE TROOPER","STATE TROOPER FIRST CLASS","STATE TROOPER","CADET",
  ],
  PTA: [
    "CAPTAIN","LIEUTENANT","SERGEANT FIRST CLASS","SERGEANT","CORPORAL",
    "SENIOR TROOPER","TROOPER FIRST CLASS","TROOPER","CADET","TRAINEE",
  ],
  IA: [
    "CAPTAIN","LIEUTENANT","SERGEANT FIRST CLASS","SERGEANT","CORPORAL",
    "SENIOR TROOPER","TROOPER FIRST CLASS","TROOPER",
  ],
  SWAT: [
    "CAPTAIN","LIEUTENANT","SERGEANT FIRST CLASS","SERGEANT","CORPORAL",
    "SENIOR TROOPER","TROOPER FIRST CLASS","TROOPER",
  ],
  FIB: [
    "CAPTAIN","LIEUTENANT","SERGEANT FIRST CLASS","SERGEANT","CORPORAL",
    "SENIOR TROOPER","TROOPER FIRST CLASS","TROOPER",
  ],
  "Game Wardens": [
    "CAPTAIN","LIEUTENANT","SERGEANT FIRST CLASS","SERGEANT","CORPORAL",
    "SENIOR DEPUTY","DEPUTY FIRST CLASS","DEPUTY","TRAINEE",
  ],
  Management: [
    "CHIEF","ASSISTANT CHIEF","SHERIFF","COLONEL",
    "SENIOR DEPUTY CHIEF","UNDERSHERIFF","ASSISTANT COLONEL",
    "DEPUTY CHIEF","ASSISTANT SHERIFF","DEPUTY COLONEL","CAPTAIN",
  ],
  FTP: [
    "LIEUTENANT","SERGEANT FIRST CLASS","SERGEANT","CORPORAL",
    "SENIOR TROOPER","TROOPER FIRST CLASS","TROOPER","CADET","TRAINEE",
  ],
};

const ALL_RANKS = [
  "CHIEF","ASSISTANT CHIEF","SHERIFF","COLONEL","SENIOR DEPUTY CHIEF","UNDERSHERIFF",
  "ASSISTANT COLONEL","DEPUTY CHIEF","ASSISTANT SHERIFF","DEPUTY COLONEL","CAPTAIN",
  "LIEUTENANT","SERGEANT FIRST CLASS","SERGEANT","CORPORAL","SENIOR TROOPER","SENIOR DEPUTY",
  "SENIOR STATE TROOPER","TROOPER FIRST CLASS","DEPUTY FIRST CLASS","STATE TROOPER FIRST CLASS",
  "TROOPER","DEPUTY","STATE TROOPER","CADET","TRAINEE","RECRUIT",
];

const QUAL_FIELDS: { key: keyof OfficerFormValues; label: string }[] = [
  { key: "pilot", label: "Pilot" },
  { key: "mdt", label: "MDT" },
  { key: "seu", label: "SEU" },
  { key: "smg", label: "SMG" },
  { key: "rifle", label: "Rifle" },
  { key: "shotgun", label: "Shotgun" },
  { key: "rifleTierII", label: "Rifle Tier II" },
  { key: "ftp", label: "FTP" },
  { key: "isManagement", label: "Management" },
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
      dateOfJoining: defaultValues?.dateOfJoining ?? todayMDY(),
      lastPromotion: defaultValues?.lastPromotion ?? "",
      pilot: defaultValues?.pilot ?? false,
      mdt: defaultValues?.mdt ?? false,
      seu: defaultValues?.seu ?? false,
      smg: defaultValues?.smg ?? false,
      rifle: defaultValues?.rifle ?? false,
      shotgun: defaultValues?.shotgun ?? false,
      rifleTierII: defaultValues?.rifleTierII ?? false,
      ftp: defaultValues?.ftp ?? false,
      isManagement: defaultValues?.isManagement ?? false,
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

  const { data: settings } = useSettings();
  const selectedDept = useWatch({ control: form.control, name: "department" });
  const selectedRank = useWatch({ control: form.control, name: "rank" });
  const availableRanks = settings?.ranks ?? ALL_RANKS;
  const availableDepts = settings?.departments ?? ["SASP","BCSO","SAHP","IA","FTP","Management","SWAT","FIB","Game Wardens"];
  const availableDivisions = settings?.divisions ?? ["High Command","Low Command (HR)","Field Training Supervisor","Field Training Officer","Field Training Trainee","Training Academy"];

  useEffect(() => {
    const currentRank = form.getValues("rank");
    if (currentRank && !availableRanks.includes(currentRank)) {
      form.setValue("rank", availableRanks[availableRanks.length - 1] ?? "CADET");
    }
  }, [selectedDept]);

  // When rank changes during EDIT (not initial load), auto-fill lastPromotion with today
  const initialRank = defaultValues?.rank;
  useEffect(() => {
    if (initialRank !== undefined && selectedRank !== initialRank) {
      form.setValue("lastPromotion", todayMDY());
    }
  }, [selectedRank]);

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
      isManagement: values.isManagement ?? false,
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
              <FormLabel className="text-xs">Name *</FormLabel>
              <FormControl><Input placeholder="Ricardo Lance" {...field} data-testid="input-name" /></FormControl>
            </FormItem>
          )} />
          <FormField control={form.control} name="division" render={({ field }) => (
            <FormItem>
              <FormLabel className="text-xs">Division</FormLabel>
              <Select
                onValueChange={(v) => field.onChange(v === "__none__" ? "" : v)}
                value={field.value || "__none__"}
              >
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Select division" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="__none__">
                    <span className="text-muted-foreground italic">— None —</span>
                  </SelectItem>
                  {availableDivisions.map((d) => (
                    <SelectItem key={d} value={d}>{d}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
                  {availableDepts.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}
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
                <SelectContent className="max-h-[260px] overflow-y-auto scroll-smooth">
                  {availableRanks.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
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
                  <SelectItem value="Active">Active</SelectItem>
                  <SelectItem value="Semi-Active">Semi-Active</SelectItem>
                  <SelectItem value="Inactive">Inactive</SelectItem>
                  <SelectItem value="Suspended">Suspended</SelectItem>
                  <SelectItem value="LOA">LOA</SelectItem>
                  <SelectItem value="Vacant">Vacant</SelectItem>
                  <SelectSeparator />
                  <SelectItem value="DISCHARGED">⚫ DISCHARGED</SelectItem>
                  <SelectItem value="FIRED">🔴 FIRED</SelectItem>
                  <SelectItem value="REMOVED">🟡 REMOVED</SelectItem>
                  <SelectItem value="TERMINATED">🟠 TERMINATED</SelectItem>
                  <SelectItem value="RESIGNED">🟣 RESIGNED</SelectItem>
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
              <FormControl>
                <FormDatePicker value={field.value} onChange={field.onChange} placeholder="MM/DD/YYYY" />
              </FormControl>
            </FormItem>
          )} />
          <FormField control={form.control} name="lastPromotion" render={({ field }) => (
            <FormItem>
              <FormLabel className="text-xs">Last Promotion</FormLabel>
              <FormControl>
                <FormDatePicker value={field.value} onChange={field.onChange} placeholder="MM/DD/YYYY" />
              </FormControl>
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
              <Select onValueChange={field.onChange} value={field.value ?? "0/4"}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="0/4" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="0/4">0/4</SelectItem>
                  <SelectItem value="1/4">1/4</SelectItem>
                  <SelectItem value="2/4">2/4</SelectItem>
                  <SelectItem value="3/4">3/4</SelectItem>
                  <SelectItem value="4/4">4/4</SelectItem>
                </SelectContent>
              </Select>
            </FormItem>
          )} />
          <FormField control={form.control} name="strikesMinor" render={({ field }) => (
            <FormItem>
              <FormLabel className="text-xs">Strikes (Minor)</FormLabel>
              <Select onValueChange={field.onChange} value={field.value ?? "0/2"}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="0/2" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="0/2">0/2</SelectItem>
                  <SelectItem value="1/2">1/2</SelectItem>
                  <SelectItem value="2/2">2/2</SelectItem>
                </SelectContent>
              </Select>
            </FormItem>
          )} />
        </div>

        {/* Discord */}
        <div className="grid grid-cols-2 gap-3">
          <FormField control={form.control} name="discordUsername" render={({ field }) => (
            <FormItem>
              <FormLabel className="text-xs">Discord Username</FormLabel>
              <FormControl><Input placeholder="username" {...field} data-testid="input-discord" /></FormControl>
            </FormItem>
          )} />
          <FormField control={form.control} name="discordUid" render={({ field }) => (
            <FormItem>
              <FormLabel className="text-xs">Discord UID *</FormLabel>
              <FormControl><Input placeholder="442421398913155092" {...field} /></FormControl>
            </FormItem>
          )} />
        </div>

        {/* Rockstar License */}
        <FormField control={form.control} name="rockstarLicenseId" render={({ field }) => (
          <FormItem>
            <FormLabel className="text-xs">Rockstar License ID *</FormLabel>
            <FormControl>
              <div className="flex items-center rounded-md border border-input bg-background overflow-hidden focus-within:ring-1 focus-within:ring-ring">
                <span className="px-2 py-2 text-xs font-mono text-muted-foreground bg-muted border-r border-input select-none whitespace-nowrap">
                  license:
                </span>
                <input
                  className="flex-1 px-2 py-2 text-xs font-mono bg-transparent outline-none placeholder:text-muted-foreground/50"
                  placeholder="09804dc3c0d77eaa..."
                  value={(field.value ?? "").replace(/^license:/, "")}
                  onChange={(e) => field.onChange(e.target.value ? `license:${e.target.value}` : "")}
                />
              </div>
            </FormControl>
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
