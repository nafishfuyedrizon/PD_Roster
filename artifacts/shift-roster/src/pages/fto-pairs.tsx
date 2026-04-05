import React, { useState } from "react";
import { Layout } from "@/components/layout";
import {
  useGetFtoPairs,
  getGetFtoPairsQueryKey,
  useListWeekPeriods,
  getListWeekPeriodsQueryKey,
} from "@workspace/api-client-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { UsersRound, GraduationCap, Clock } from "lucide-react";

export default function FtoPairsPage() {
  const [weekPeriod, setWeekPeriod] = useState<string>("ALL");

  const { data: weekPeriods = [] } = useListWeekPeriods({
    query: { queryKey: getListWeekPeriodsQueryKey() },
  });

  const queryParams = weekPeriod !== "ALL" ? { weekPeriod } : {};

  const { data: ftoPairs = [], isLoading } = useGetFtoPairs(queryParams, {
    query: { queryKey: getGetFtoPairsQueryKey(queryParams) },
  });

  return (
    <Layout>
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 mb-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <UsersRound className="w-8 h-8 text-primary" />
            Field Training Assignments
          </h1>
          <p className="text-muted-foreground mt-1 font-mono text-sm">
            Current FTO-Trainee pairings and progress
          </p>
        </div>

        <div className="bg-card border border-border p-2 rounded-lg flex items-center gap-4">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider ml-2">Period</span>
          <Select value={weekPeriod} onValueChange={setWeekPeriod}>
            <SelectTrigger className="w-[180px]" data-testid="select-fto-week">
              <SelectValue placeholder="Select Week" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All Time</SelectItem>
              {weekPeriods.map((wp) => (
                <SelectItem key={wp} value={wp}>
                  {wp}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {isLoading ? (
        <div className="h-64 flex items-center justify-center text-muted-foreground font-mono">
          Loading FTO assignments...
        </div>
      ) : ftoPairs.length === 0 ? (
        <div className="h-64 flex flex-col items-center justify-center text-muted-foreground bg-card border border-border rounded-lg">
          <GraduationCap className="w-12 h-12 mb-4 opacity-50" />
          <p className="text-lg font-medium text-foreground">No FTO Pairings Found</p>
          <p className="text-sm">No officers currently assigned to an FTO for this period.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {ftoPairs.map((pair, index) => (
            <Card key={`${pair.ftoName}-${index}`} className="bg-card border-border" data-testid={`card-fto-${index}`}>
              <CardHeader className="bg-secondary/30 border-b border-border pb-4">
                <CardTitle className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <ShieldIcon className="w-5 h-5 text-primary" />
                    <span>FTO: {pair.ftoName}</span>
                  </div>
                  <Badge variant="outline" className="font-mono bg-background">
                    {pair.trainees.length} Trainee{pair.trainees.length !== 1 ? 's' : ''}
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-4">
                <div className="space-y-3">
                  {pair.trainees.map((trainee) => (
                    <div key={trainee.id} className="flex justify-between items-center p-3 rounded-md bg-background border border-border" data-testid={`fto-trainee-${trainee.id}`}>
                      <div>
                        <div className="font-semibold text-sm">{trainee.name}</div>
                        <div className="text-xs text-muted-foreground font-mono">{trainee.department} • {trainee.rank}</div>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <div className="flex items-center gap-1 text-xs font-mono text-muted-foreground">
                          <Clock className="w-3 h-3" />
                          {trainee.dutyHours || "0h 0m"}
                        </div>
                        {trainee.completionStatus === "DONE" && (
                          <Badge className="bg-green-600/20 text-green-400 border-green-600/30 text-[10px] h-4">
                            CLEARED
                          </Badge>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </Layout>
  );
}

function ShieldIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10" />
    </svg>
  );
}
