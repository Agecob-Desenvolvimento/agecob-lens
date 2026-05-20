import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface PeriodoFilterProps {
  dateFrom: string;
  dateTo: string;
  onDateFromChange: (v: string) => void;
  onDateToChange: (v: string) => void;
  inline?: boolean;
}

export default function PeriodoFilter({
  dateFrom,
  dateTo,
  onDateFromChange,
  onDateToChange,
  inline,
}: PeriodoFilterProps) {
  if (inline) {
    return (
      <div className="flex flex-col gap-2 w-full min-w-0 overflow-hidden">
        <div className="flex flex-col gap-1 min-w-0">
          <Label htmlFor="period-from" className="text-[10px] font-medium text-muted-foreground">De</Label>
          <Input
            id="period-from"
            type="date"
            value={dateFrom}
            onChange={(e) => onDateFromChange(e.target.value)}
            className="h-7 w-full min-w-0 text-xs"
          />
        </div>
        <div className="flex flex-col gap-1 min-w-0">
          <Label htmlFor="period-to" className="text-[10px] font-medium text-muted-foreground">Até</Label>
          <Input
            id="period-to"
            type="date"
            value={dateTo}
            onChange={(e) => onDateToChange(e.target.value)}
            className="h-7 w-full min-w-0 text-xs"
          />
        </div>
      </div>
    );
  }
  return (
    <Card>
      <CardContent className="pt-4 pb-3 px-4">
        <div className="flex flex-wrap gap-4 items-end">
          <div className="flex flex-col gap-1">
            <Label htmlFor="period-from" className="text-xs font-medium">De</Label>
            <Input
              id="period-from"
              type="date"
              value={dateFrom}
              onChange={(e) => onDateFromChange(e.target.value)}
              className="w-40 text-sm"
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="period-to" className="text-xs font-medium">Até</Label>
            <Input
              id="period-to"
              type="date"
              value={dateTo}
              onChange={(e) => onDateToChange(e.target.value)}
              className="w-40 text-sm"
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
