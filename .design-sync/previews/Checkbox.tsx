import { Checkbox } from 'agecob-lens';

export function States() {
  const rows = [
    { label: 'KPIs do período', checked: true, disabled: false },
    { label: 'Ranking de agentes', checked: false, disabled: false },
    { label: 'Exceções por portfólio (indisponível)', checked: false, disabled: true },
  ];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {rows.map((r) => (
        <label
          key={r.label}
          className={
            'flex items-center gap-3 rounded-md border border-slate-200 px-3 py-2.5 text-sm ' +
            (r.disabled ? 'opacity-50' : 'cursor-pointer hover:bg-slate-50')
          }
        >
          <Checkbox checked={r.checked} disabled={r.disabled} />
          {r.label}
        </label>
      ))}
    </div>
  );
}
