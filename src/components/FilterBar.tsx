import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface FilterBarProps {
  category: string;
  onCategoryChange: (v: string) => void;
  carteira: string;
  onCarteiraChange: (v: string) => void;
  assessoria: string;
  onAssessoriaChange: (v: string) => void;
}

export default function FilterBar({
  category, onCategoryChange,
  carteira, onCarteiraChange,
  assessoria, onAssessoriaChange,
}: FilterBarProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {/* Category */}
      <Card>
        <CardHeader className="pb-2 pt-3 px-4">
          <CardTitle className="text-sm font-medium text-muted-foreground">Category</CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-3 flex gap-2">
          {["Todas", "Autos"].map((opt) => (
            <Button
              key={opt}
              size="sm"
              variant={category === opt ? "default" : "outline"}
              onClick={() => onCategoryChange(opt)}
              className="flex-1"
            >
              {opt}
            </Button>
          ))}
        </CardContent>
      </Card>

      {/* Carteira */}
      <Card>
        <CardHeader className="pb-2 pt-3 px-4">
          <CardTitle className="text-sm font-medium text-muted-foreground">Carteira</CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-3 flex gap-2">
          {["Geral", "Others"].map((opt) => (
            <Button
              key={opt}
              size="sm"
              variant={carteira === opt ? "default" : "outline"}
              onClick={() => onCarteiraChange(opt)}
              className="flex-1"
            >
              {opt}
            </Button>
          ))}
        </CardContent>
      </Card>

      {/* Assessoria */}
      <Card>
        <CardHeader className="pb-2 pt-3 px-4">
          <CardTitle className="text-sm font-medium text-muted-foreground">Assessoria</CardTitle>
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
