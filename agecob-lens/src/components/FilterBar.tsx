import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface FilterBarProps {
  carteira: string;
  onCarteiraChange: (v: string) => void;
  assessoria: string;
  onAssessoriaChange: (v: string) => void;
}

export default function FilterBar({
  carteira, onCarteiraChange,
  assessoria, onAssessoriaChange,
}: FilterBarProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {/* Carteira */}
      <Card className="min-w-0">
        <CardHeader className="pb-2 pt-3 px-4">
          <CardTitle className="text-base font-semibold text-muted-foreground">Carteira</CardTitle>
          <p className="text-xs text-amber-300 truncate" title="Pendente de negócio (decisão ainda não definida)">Pendente de negócio (decisão ainda não definida)</p>
        </CardHeader>
        <CardContent className="px-4 pb-3 flex gap-2">
          {["Geral", "Outras"].map((opt) => (
            <Button
              key={opt}
              size="sm"
              variant={carteira === opt ? "default" : "outline"}
              onClick={() => onCarteiraChange(opt)}
              className="flex-1 text-sm"
            >
              {opt}
            </Button>
          ))}
        </CardContent>
      </Card>

      {/* Assessoria */}
      <Card className="min-w-0">
        <CardHeader className="pb-2 pt-3 px-4">
          <CardTitle className="text-base font-semibold text-muted-foreground">Assessoria</CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-3">
          <Select value={assessoria} onValueChange={onAssessoriaChange}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="963:AGECOB_LP">963:AGECOB_LP</SelectItem>
              <SelectItem value="todos">Todos</SelectItem>
            </SelectContent>
          </Select>
        </CardContent>
      </Card>
    </div>
  );
}
