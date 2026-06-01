import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { BulletPanelData } from "./BulletChartsPanel";

const STORAGE_KEY = "agdash-custom-metas";

export interface CustomMetas {
  cpc: number | null;
  conversao: number | null;
  primeiraParcela: number | null;
  excecoes: number | null;
}

function loadCustomMetas(): CustomMetas {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return { cpc: null, conversao: null, primeiraParcela: null, excecoes: null };
}

function saveCustomMetas(metas: CustomMetas) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(metas));
}

interface MetaEditorProps {
  current: BulletPanelData;
  onChange: (overrides: CustomMetas) => void;
}

export function MetaEditor({ current, onChange }: MetaEditorProps) {
  const [custom, setCustom] = useState<CustomMetas>(loadCustomMetas);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    onChange(custom);
    saveCustomMetas(custom);
  }, [custom, onChange]);

  const setMeta = useCallback(
    (key: keyof CustomMetas, raw: string) => {
      const n = parseFloat(raw);
      setCustom((prev) => ({
        ...prev,
        [key]: Number.isFinite(n) && n >= 0 ? n : null,
      }));
    },
    [],
  );

  const reset = useCallback(() => {
    const empty: CustomMetas = { cpc: null, conversao: null, primeiraParcela: null, excecoes: null };
    setCustom(empty);
    saveCustomMetas(empty);
  }, []);

  return (
    <div className="mt-1">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2"
      >
        {open ? "▾ Ocultar metas" : "▸ Definir metas personalizadas"}
      </button>
      {open && (
        <div className="mt-2 grid grid-cols-2 gap-2 rounded border border-border bg-muted/30 p-3">
          <MetaRow
            label="CPC %"
            current={current.cpc.meta}
            unit={current.cpc.unit}
            value={custom.cpc}
            onChange={(v) => setMeta("cpc", v)}
          />
          <MetaRow
            label="Conversão %"
            current={current.conversao.meta}
            unit={current.conversao.unit}
            value={custom.conversao}
            onChange={(v) => setMeta("conversao", v)}
          />
          <MetaRow
            label="1ª Parcela"
            current={current.primeiraParcela.meta}
            unit={current.primeiraParcela.unit}
            value={custom.primeiraParcela}
            onChange={(v) => setMeta("primeiraParcela", v)}
          />
          <MetaRow
            label="Exceções %"
            current={current.excecoes.meta}
            unit={current.excecoes.unit}
            value={custom.excecoes}
            onChange={(v) => setMeta("excecoes", v)}
          />
          <div className="col-span-2 flex justify-end">
            <Button
              size="sm"
              variant="ghost"
              className="text-xs h-7 text-muted-foreground"
              onClick={reset}
            >
              Resetar para padrão
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function MetaRow({
  label,
  current,
  unit,
  value,
  onChange,
}: {
  label: string;
  current: number;
  unit: "%" | "BRL" | "count";
  value: number | null;
  onChange: (v: string) => void;
}) {
  const display = value != null ? String(value) : "";
  const placeholder = unit === "BRL"
    ? `padrão: ${current.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : unit === "%"
      ? `padrão: ${current.toFixed(1)}%`
      : `padrão: ${current}`;

  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] font-semibold text-slate-500">{label}</span>
      <Input
        type="number"
        min={0}
        step={unit === "BRL" ? 100 : unit === "%" ? 0.5 : 1}
        placeholder={placeholder}
        value={display}
        onChange={(e) => onChange(e.target.value)}
        className="h-7 text-xs rounded"
      />
    </div>
  );
}

function scaleRanges(
  base: { ranges: { poor: number; ok: number; good: number }; meta: number },
  newMeta: number,
): { poor: number; ok: number; good: number } {
  const ratio = base.meta > 0 ? newMeta / base.meta : 1;
  return {
    poor: Math.round(base.ranges.poor * ratio),
    ok: Math.round(base.ranges.ok * ratio),
    good: Math.round(base.ranges.good * ratio),
  };
}

export function applyCustomMetas(
  base: BulletPanelData,
  overrides: CustomMetas,
): BulletPanelData {
  return {
    cpc: overrides.cpc != null
      ? { ...base.cpc, meta: overrides.cpc, ranges: scaleRanges(base.cpc, overrides.cpc) }
      : base.cpc,
    conversao: overrides.conversao != null
      ? { ...base.conversao, meta: overrides.conversao, ranges: scaleRanges(base.conversao, overrides.conversao) }
      : base.conversao,
    primeiraParcela: overrides.primeiraParcela != null
      ? { ...base.primeiraParcela, meta: overrides.primeiraParcela, ranges: scaleRanges(base.primeiraParcela, overrides.primeiraParcela) }
      : base.primeiraParcela,
    excecoes: overrides.excecoes != null
      ? { ...base.excecoes, meta: overrides.excecoes, ranges: scaleRanges(base.excecoes, overrides.excecoes) }
      : base.excecoes,
  };
}
