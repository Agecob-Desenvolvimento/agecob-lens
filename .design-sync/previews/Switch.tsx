import { Switch } from 'agecob-lens';

export function States() {
  const rows = [
    { label: 'Notificações por e-mail', checked: true, disabled: false },
    { label: 'Alertas de exceções críticas', checked: false, disabled: false },
    { label: 'Resumo diário (indisponível)', checked: false, disabled: true },
  ];
  return (
    <div className="flex flex-col gap-3">
      {rows.map((r) => (
        <label
          key={r.label}
          className={
            'flex items-center justify-between gap-4 rounded-md border border-slate-200 px-3 py-2.5 text-sm w-full ' +
            (r.disabled ? 'opacity-50' : 'hover:bg-slate-50')
          }
          style={{ minWidth: 280 }}
        >
          {r.label}
          <Switch checked={r.checked} disabled={r.disabled} />
        </label>
      ))}
    </div>
  );
}
