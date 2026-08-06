import { useCallback, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { AlertTriangle, Upload, FileText, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatBRLCompact, DIAS_UTEIS_MES } from "@/lib/metrics";
import { formatMesLabel } from "@/lib/dates";
import { uploadMetasPDF } from "@/services/api";
import type { MetaFiltrada } from "@/hooks/useMetasData";
import { toast } from "@/hooks/use-toast";

/* ------------------------------------------------------------------ *
 * Tipos
 * ------------------------------------------------------------------ */

export interface RealPorPortfolio {
  portfolio_name: string;
  /** Caixa recebido no mês (VR_PAGO) — base da barra Real vs Meta */
  valor_recebido: number;
  valor_primeira_parcela: number;
  qtd_acordos: number;
}

export interface MetaVsRealPanelProps {
  metasFiltradas: MetaFiltrada[];
  isMedia: boolean;
  mediaRow: MetaFiltrada | null;
  /** Meses disponíveis no PDF carregado (ex: ["202607","202608","202609"]) */
  meses: string[];
  mesSelecionado: string | null;
  onMesChange: (mes: string) => void;
  dadosReais?: Record<string, RealPorPortfolio>;
  /** Σ 1ª parcela gerada HOJE nas carteiras exibidas — base da meta do dia */
  geracaoHojeTotal?: number | null;
  loading?: boolean;
  /** Trimestre das metas carregadas (ex: "2T26"); null se nenhuma metas */
  periodoMetas: string | null;
  /** Trimestre corrente — se ≠ periodoMetas, pede atualização do PDF */
  trimestreAtual: string;
}

/* ------------------------------------------------------------------ *
 * Helpers
 * ------------------------------------------------------------------ */

// Zonas de atingimento (real / meta): crítico < 70% · atenção 70–94% · bom ≥ 95%.
// Paleta semântica canônica do spec executivo (Specs Componentes Executivos):
// Positive→emerald-500 · Warning→amber-500 · Critical→rose-500.
const ZONA_ATENCAO = 70;
const ZONA_BOM = 95;

function achievementColor(pct: number): string {
  if (pct >= ZONA_BOM) return "bg-emerald-500";
  if (pct >= ZONA_ATENCAO) return "bg-amber-500";
  return "bg-rose-500";
}

function achievementTextColor(pct: number): string {
  if (pct >= ZONA_BOM) return "text-emerald-700 dark:text-emerald-300";
  if (pct >= ZONA_ATENCAO) return "text-amber-700 dark:text-amber-300";
  return "text-rose-700 dark:text-rose-300";
}

/* ------------------------------------------------------------------ *
 * Component
 * ------------------------------------------------------------------ */

export function MetaVsRealPanel({
  metasFiltradas,
  isMedia,
  mediaRow,
  meses,
  mesSelecionado,
  onMesChange,
  dadosReais,
  geracaoHojeTotal,
  loading,
  periodoMetas,
  trimestreAtual,
}: MetaVsRealPanelProps) {
  const mesLabel = mesSelecionado ? formatMesLabel(mesSelecionado) : "—";
  const hasRealData = dadosReais != null && Object.keys(dadosReais).length > 0;
  const semMetas = metasFiltradas.length === 0;

  // Meta do dia (agregado): Σ meta_caixa das carteiras exibidas ÷ 18 dias úteis.
  // % = 1ª parcela gerada hoje / meta-dia. Mesmo conjunto de carteiras no num. e denom.
  const totalMetaCaixa = metasFiltradas.reduce((s, m) => s + m.meta_caixa, 0);
  const metaDia = totalMetaCaixa > 0 ? totalMetaCaixa / DIAS_UTEIS_MES : null;
  const pctMetaDia =
    metaDia != null && geracaoHojeTotal != null ? (geracaoHojeTotal / metaDia) * 100 : null;
  // Pede atualização quando o PDF carregado não é do trimestre corrente (ou não há PDF)
  const desatualizado = periodoMetas !== trimestreAtual;

  // Real agregado p/ a linha "Total da carteira": soma o real dos portfólios exibidos.
  // A chave é o nome do portfólio (mediaRow tem label sintético, não casa em dadosReais).
  const mediaReal = useMemo<RealPorPortfolio | undefined>(() => {
    if (!mediaRow || !dadosReais) return undefined;
    let soma = 0;
    let achou = false;
    for (const m of metasFiltradas) {
      const r = dadosReais[m.portfolio];
      if (r) { soma += r.valor_recebido; achou = true; }
    }
    if (!achou) return undefined;
    return { portfolio_name: mediaRow.portfolio, valor_recebido: soma, qtd_acordos: 0, valor_primeira_parcela: 0 };
  }, [mediaRow, dadosReais, metasFiltradas]);

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-3">
          <div>
            <CardTitle className="text-sm font-semibold text-foreground">
              Meta Caixa vs Caixa Recebido
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">
              Meta Caixa do PDF trimestral
              {periodoMetas ? ` · ${periodoMetas}` : ""}
              {isMedia ? " (Total da carteira)" : ""}
              {hasRealData ? " · Real = caixa recebido (VR_PAGO) do mês" : ""}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <MetasUploadDialog stale={desatualizado} />

            <Select value={mesSelecionado ?? ""} onValueChange={onMesChange}>
              <SelectTrigger className="h-7 w-[130px] text-xs">
                <SelectValue>{mesLabel}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {meses.map((mes) => (
                  <SelectItem key={mes} value={mes} className="text-xs">
                    {formatMesLabel(mes)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-2">
        {metaDia != null && (
          <div className="flex items-center justify-between gap-3 rounded-md border border-slate-200 dark:border-border bg-slate-50 dark:bg-white/5 px-3 py-2">
            <div className="flex flex-col">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Meta do dia · 1ª parcela gerada hoje
              </span>
              <span className="text-[10px] text-slate-400">
                meta caixa do mês ÷ {DIAS_UTEIS_MES} dias úteis
              </span>
            </div>
            <div className="flex items-baseline gap-2 text-right tabular-nums">
              <span
                className={cn(
                  "text-lg font-bold leading-none",
                  pctMetaDia != null ? achievementTextColor(pctMetaDia) : "text-slate-400",
                )}
              >
                {pctMetaDia != null ? `${Math.round(pctMetaDia)}%` : "—"}
              </span>
              <span className="text-[11px] text-slate-500 dark:text-slate-400">
                {formatBRLCompact(geracaoHojeTotal ?? null)} / meta/dia {formatBRLCompact(metaDia)}
              </span>
            </div>
          </div>
        )}

        {desatualizado && (
          <div className="flex items-start gap-2 rounded-md border border-rose-200 dark:border-rose-800/70 bg-rose-50 dark:bg-rose-950/40 px-3 py-2 text-sm text-rose-700 dark:text-rose-300">
            <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" aria-hidden />
            <span>
              {periodoMetas
                ? <>Metas carregadas são do trimestre <strong>{periodoMetas}</strong>. O trimestre corrente é <strong>{trimestreAtual}</strong>. Envie o PDF mais recente para atualizar.</>
                : <>Nenhuma tabela de metas carregada para <strong>{trimestreAtual}</strong>. Envie o PDF do trimestre para habilitar a comparação Meta vs Real.</>}
            </span>
          </div>
        )}

        {isMedia && (
          <div className="flex items-start gap-2 rounded-md border border-amber-200 dark:border-amber-800/70 bg-amber-50 dark:bg-amber-950/40 px-3 py-2 text-sm text-amber-700 dark:text-amber-300">
            <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" aria-hidden />
            <span>
              <strong>Todos os Portfólios</strong>: a linha <strong>Total da carteira</strong>{" "}
              soma as metas de todos os portfólios (alvo do escritório); as barras
              abaixo são por portfólio. Portfólios sem meta no PDF são omitidos.
            </span>
          </div>
        )}

        {loading ? (
          <div className="h-48 animate-pulse bg-muted rounded-lg" />
        ) : semMetas ? (
          <div className="flex h-32 flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
            <FileText className="h-6 w-6 text-slate-300 dark:text-slate-600" aria-hidden />
            Nenhuma meta para exibir. Use <strong className="text-sky-700 dark:text-sky-300">Atualizar PDF</strong> acima.
          </div>
        ) : (
          <div className="space-y-1.5">
            {mediaRow && (
              <div className="mb-2 pb-2 border-b border-slate-200 dark:border-border">
                <MetaBarRow item={mediaRow} real={mediaReal} />
              </div>
            )}
            {metasFiltradas.map((item) => (
              <MetaBarRow key={item.portfolio} item={item} real={dadosReais?.[item.portfolio]} />
            ))}
          </div>
        )}

        {/* Legenda — trilha cheia = meta; cor da barra = % de atingimento do real */}
        <div className="mt-2 flex flex-wrap items-center gap-3.5 text-[10px] text-slate-500 dark:text-slate-400">
          <span className="text-slate-400">barra = % da meta (trilha cheia = 100%)</span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-2.5 w-2.5 rounded-sm bg-rose-500" />
            crítico &lt;70%
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-2.5 w-2.5 rounded-sm bg-amber-500" />
            atenção 70–94%
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-2.5 w-2.5 rounded-sm bg-emerald-500" />
            bom ≥95%
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

/* ------------------------------------------------------------------ *
 * MetasUploadDialog — pop-up com dropzone para escanear o PDF de metas
 * ------------------------------------------------------------------ */

function MetasUploadDialog({ stale }: { stale: boolean }) {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const enviar = useCallback(
    async (file: File) => {
      if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
        toast({ title: "Formato inválido", description: "Selecione um arquivo PDF.", variant: "destructive" });
        return;
      }
      setUploading(true);
      try {
        await uploadMetasPDF(file);
        toast({ title: "Metas atualizadas", description: `${file.name} escaneado com sucesso.` });
        queryClient.invalidateQueries({ queryKey: ["metas"] });
        setOpen(false);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err ?? "Erro desconhecido");
        toast({ title: "Erro ao escanear PDF", description: msg, variant: "destructive" });
      } finally {
        setUploading(false);
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
    },
    [queryClient],
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files?.[0];
      if (file) enviar(file);
    },
    [enviar],
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          type="button"
          className={cn(
            "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium transition-colors",
            stale
              ? "border-rose-200 dark:border-rose-800/70 bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 hover:bg-rose-100 dark:hover:bg-rose-950/60"
              : "border-sky-200 dark:border-sky-800/70 bg-sky-50 dark:bg-sky-950/40 text-sky-700 dark:text-sky-300 hover:bg-sky-100 dark:hover:bg-sky-950/60",
          )}
          title="Enviar PDF de metas do trimestre"
        >
          <Upload className="h-3 w-3" />
          Atualizar PDF
        </button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Atualizar metas do trimestre</DialogTitle>
          <DialogDescription>
            Envie o PDF de metas (PNT). Os valores são escaneados e validados
            automaticamente antes de substituir a tabela atual.
          </DialogDescription>
        </DialogHeader>

        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,application/pdf"
          className="hidden"
          aria-label="Arquivo PDF de metas"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) enviar(file);
          }}
        />

        <button
          type="button"
          disabled={uploading}
          onClick={() => fileInputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          className={cn(
            "flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-6 py-10 text-center transition-colors",
            dragOver ? "border-sky-400 bg-sky-50 dark:bg-sky-950/40" : "border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-white/5 hover:bg-slate-100 dark:hover:bg-white/10",
            uploading && "opacity-60 cursor-not-allowed",
          )}
        >
          {uploading ? (
            <>
              <Loader2 className="h-7 w-7 animate-spin text-sky-600 dark:text-sky-400" aria-hidden />
              <span className="text-sm font-medium text-slate-600 dark:text-slate-300">Escaneando PDF…</span>
            </>
          ) : (
            <>
              <Upload className="h-7 w-7 text-slate-400" aria-hidden />
              <span className="text-sm font-medium text-slate-700 dark:text-slate-200">
                Insira o arquivo aqui para fazer o escaneio do PDF
              </span>
              <span className="text-xs text-slate-400">
                Arraste e solte ou clique para selecionar (somente .pdf)
              </span>
            </>
          )}
        </button>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ *
 * MetaBarRow — barra horizontal: Real (colorido) vs Meta (linha)
 * ------------------------------------------------------------------ */

function fmtHeadcount(n: number): string {
  return n.toLocaleString("pt-BR", { maximumFractionDigits: 1 });
}

function MetaBarRow({
  item,
  real,
}: {
  item: MetaFiltrada;
  real?: RealPorPortfolio;
}) {
  // Compara contra a Meta Caixa (caixa = dinheiro recebido), apples-to-apples
  // com o real = VR_PAGO. Retomadas ficam fora (não há real de retomada).
  const { portfolio, grupo, meta_caixa, qtd_negociadores, _isMedia } = item;
  const temMeta = meta_caixa > 0;
  const metaFmt = formatBRLCompact(meta_caixa);
  const realValor = real?.valor_recebido ?? null;
  const realFmt = realValor != null ? formatBRLCompact(realValor) : "—";
  // Modelo de atingimento: a trilha inteira = meta (100%); a barra preenche o % do real.
  const pct = temMeta && realValor != null ? Math.round((realValor / meta_caixa) * 100) : null;
  const realW = pct != null ? Math.min(100, pct) : 0;
  const barColor = _isMedia ? "bg-sky-500" : achievementColor(pct ?? 0);
  const txtColor = _isMedia ? "text-sky-700 dark:text-sky-300" : achievementTextColor(pct ?? 0);

  const subtitulo = [
    grupo && !_isMedia ? grupo : null,
    qtd_negociadores > 0 && !_isMedia ? `${fmtHeadcount(qtd_negociadores)} HC` : null,
  ].filter(Boolean).join(" · ");

  return (
    <div className="flex items-center gap-3">
      <div className="w-40 flex-shrink-0">
        <div className={cn("truncate text-xs font-semibold text-slate-700 dark:text-slate-200", _isMedia && "italic")}>
          {portfolio}
        </div>
        {subtitulo && (
          <div className="truncate text-[10px] text-slate-400">{subtitulo}</div>
        )}
      </div>

      {/* Trilha = meta (100%). Preenchimento sólido = atingimento do real. */}
      <div className="relative h-7 flex-1 overflow-hidden rounded-md bg-slate-100 dark:bg-white/10 ring-1 ring-inset ring-slate-200 dark:ring-slate-700">
        {realW > 0 && (
          <div
            className={cn("absolute inset-y-0 left-0 rounded-md transition-[width] duration-300", barColor)}
            style={{ width: `${realW}%` }}
          />
        )}
        {pct != null ? (
          <span className="absolute inset-y-0 right-2 flex items-center text-[11px] font-bold tabular-nums text-slate-800 dark:text-slate-200">
            {pct}%
          </span>
        ) : (
          <span className="absolute inset-y-0 left-2 flex items-center text-[10px] text-slate-400">
            {temMeta ? "sem dados reais" : "sem meta"}
          </span>
        )}
      </div>

      {/* Valores: Real (destaque, colorido) sobre Meta (referência). */}
      <div className="w-28 flex-shrink-0 text-right tabular-nums">
        <div className={cn("text-sm font-bold leading-tight", txtColor)}>{realFmt}</div>
        <div className="text-[10px] leading-tight text-slate-400">meta {metaFmt}</div>
      </div>
    </div>
  );
}

export default MetaVsRealPanel;
