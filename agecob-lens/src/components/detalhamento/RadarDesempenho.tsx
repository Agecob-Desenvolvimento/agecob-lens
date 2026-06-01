import {
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { fmtBRL, fmtPct, fmtNum } from "@/lib/metrics";

export interface RadarDimension {
  dim: string;
  agent: number;
  team: number;
  rawAgent: number;
  rawTeam: number;
  unit: "BRL" | "%" | "count";
}

interface RadarDesempenhoProps {
  data: RadarDimension[];
  agentName: string | null;
}

const AGENT_COLOR = "hsl(199, 89%, 48%)"; // sky-500
const TEAM_COLOR = "hsl(215, 16%, 47%)";  // slate-500
const GRID_COLOR = "hsl(214, 32%, 64%)";  // border, 30% darker

const GRADE_TICKS = [20, 40, 60, 80, 100];
const GRADE_LABEL: Record<number, string> = { 20: "D", 40: "C", 60: "B", 80: "A", 100: "S" };

function fmtRaw(v: number, unit: RadarDimension["unit"]): string {
  if (unit === "BRL") return fmtBRL(v);
  if (unit === "%") return fmtPct(v);
  return fmtNum(v);
}

export function RadarDesempenho({ data, agentName }: RadarDesempenhoProps) {
  const label = agentName ?? "Agente";
  const hasAgent = agentName != null && agentName.length > 0;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold text-foreground">
          Performance vs Equipe
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Visão consolidada dos principais KPIs do agente.
        </p>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">
            Selecione um agente para exibir o perfil multidimensional.
          </p>
        ) : (
          <ResponsiveContainer width="100%" height={340}>
            <RadarChart data={data} outerRadius="75%">
              <PolarGrid stroke={GRID_COLOR} />
              <PolarAngleAxis
                dataKey="dim"
                tick={{ fontSize: 11, fontWeight: 600, fill: "hsl(var(--foreground))" }}
              />
              <PolarRadiusAxis
                angle={90}
                domain={[0, 100]}
                ticks={GRADE_TICKS}
                tickFormatter={(v: number) => GRADE_LABEL[v] ?? ""}
                tick={{ fontSize: 11, fontWeight: 700, fill: GRID_COLOR }}
                axisLine={false}
              />
              <Radar
                name="Equipe"
                dataKey="team"
                stroke={TEAM_COLOR}
                fill={TEAM_COLOR}
                fillOpacity={0.18}
                strokeDasharray="4 3"
              />
              <Radar
                name={label}
                dataKey="agent"
                stroke={AGENT_COLOR}
                fill={AGENT_COLOR}
                fillOpacity={0.30}
              />
              <Tooltip
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const p = payload[0]?.payload as RadarDimension | undefined;
                  if (!p) return null;
                  return (
                    <div className="rounded-md border bg-background p-2.5 text-xs space-y-1.5 shadow-md">
                      <p className="font-semibold text-foreground">{p.dim}</p>
                      <div className="space-y-0.5">
                        <p style={{ color: AGENT_COLOR }}>
                          {label}:{" "}
                          <span className="tabular-nums font-semibold">
                            {fmtRaw(p.rawAgent, p.unit)}
                          </span>
                          {" "}
                          <span className="text-muted-foreground">
                            ({p.agent})
                          </span>
                        </p>
                        <p style={{ color: TEAM_COLOR }}>
                          Equipe:{" "}
                          <span className="tabular-nums font-semibold">
                            {fmtRaw(p.rawTeam, p.unit)}
                          </span>
                          {" "}
                          <span className="text-muted-foreground">
                            ({p.team})
                          </span>
                        </p>
                      </div>
                    </div>
                  );
                }}
              />
            </RadarChart>
          </ResponsiveContainer>
        )}
        {hasAgent && data.length > 0 && (
          <div className="mt-3 flex items-center justify-center gap-4 text-[10px] text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span
                className="inline-block h-2.5 w-2.5 rounded-sm"
                style={{ backgroundColor: AGENT_COLOR }}
              />
              {label}
            </span>
            <span className="flex items-center gap-1.5">
              <span
                className="inline-block h-2.5 w-2.5 rounded-sm border border-current"
                style={{
                  backgroundColor: `${TEAM_COLOR}33`,
                  borderColor: TEAM_COLOR,
                }}
              />
              Equipe
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default RadarDesempenho;
