import { Progress } from 'agecob-lens';

export function Low() {
  return (
    <div className="flex flex-col gap-2 max-w-sm">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium">Meta de acordos — Basal</span>
        <span className="text-slate-500">20%</span>
      </div>
      <Progress value={20} />
    </div>
  );
}

export function Medium() {
  return (
    <div className="flex flex-col gap-2 max-w-sm">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium">Meta de acordos — Alfa</span>
        <span className="text-slate-500">65%</span>
      </div>
      <Progress value={65} />
    </div>
  );
}

export function Complete() {
  return (
    <div className="flex flex-col gap-2 max-w-sm">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium">Meta de acordos — Bradesco</span>
        <span className="text-slate-500">100%</span>
      </div>
      <Progress value={100} />
    </div>
  );
}
