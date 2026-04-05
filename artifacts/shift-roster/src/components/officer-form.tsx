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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Officer, CreateOfficerBody } from "@workspace/api-client-react";

const officerSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  discordId: z.string().min(3, "Discord ID is required"),
  rank: z.string().min(2, "Rank is required"),
  department: z.string().min(2, "Department is required"),
  status: z.string().min(2, "Status is required"),
  dutyHours: z.string().optional(),
  completionStatus: z.string().optional(),
  appointedFto: z.string().optional(),
  weekPeriod: z.string().min(2, "Week period is required"),
});

type OfficerFormValues = z.infer<typeof officerSchema>;

interface OfficerFormProps {
  defaultValues?: Partial<Officer>;
  onSubmit: (data: CreateOfficerBody) => void;
  isSubmitting?: boolean;
}

export function OfficerForm({ defaultValues, onSubmit, isSubmitting }: OfficerFormProps) {
  const form = useForm<OfficerFormValues>({
    resolver: zodResolver(officerSchema),
    defaultValues: {
      name: defaultValues?.name || "",
      discordId: defaultValues?.discordId || "",
      rank: defaultValues?.rank || "",
      department: defaultValues?.department || "SASP",
      status: defaultValues?.status || "Active",
      dutyHours: defaultValues?.dutyHours || "",
      completionStatus: defaultValues?.completionStatus || "",
      appointedFto: defaultValues?.appointedFto || "",
      weekPeriod: defaultValues?.weekPeriod || "",
    },
  });

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" data-testid="form-officer">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Officer Name</FormLabel>
                <FormControl>
                  <Input placeholder="John Doe" {...field} data-testid="input-name" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="discordId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Discord ID</FormLabel>
                <FormControl>
                  <Input placeholder="user#1234" {...field} data-testid="input-discord" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="rank"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Rank</FormLabel>
                <FormControl>
                  <Input placeholder="Sergeant" {...field} data-testid="input-rank" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="department"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Department</FormLabel>
                <Select onValueChange={field.onChange} defaultValue={field.value}>
                  <FormControl>
                    <SelectTrigger data-testid="select-department">
                      <SelectValue placeholder="Select a department" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="SASP">SASP</SelectItem>
                    <SelectItem value="BCSO">BCSO</SelectItem>
                    <SelectItem value="SAHP">SAHP</SelectItem>
                    <SelectItem value="PTA">PTA</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="status"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Status</FormLabel>
                <Select onValueChange={field.onChange} defaultValue={field.value}>
                  <FormControl>
                    <SelectTrigger data-testid="select-status">
                      <SelectValue placeholder="Select a status" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="Active">Active</SelectItem>
                    <SelectItem value="LOA">LOA</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="weekPeriod"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Week Period</FormLabel>
                <FormControl>
                  <Input placeholder="W1 2024" {...field} data-testid="input-week" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="dutyHours"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Duty Hours</FormLabel>
                <FormControl>
                  <Input placeholder="10h 30m" {...field} data-testid="input-hours" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="completionStatus"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Completion Status</FormLabel>
                <FormControl>
                  <Input placeholder="DONE" {...field} data-testid="input-completion" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="appointedFto"
            render={({ field }) => (
              <FormItem className="md:col-span-2">
                <FormLabel>Appointed FTO</FormLabel>
                <FormControl>
                  <Input placeholder="FTO Name" {...field} data-testid="input-fto" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        <div className="flex justify-end gap-2 pt-4">
          <Button type="submit" disabled={isSubmitting} data-testid="button-submit-officer">
            {isSubmitting ? "Saving..." : "Save Officer"}
          </Button>
        </div>
      </form>
    </Form>
  );
}
