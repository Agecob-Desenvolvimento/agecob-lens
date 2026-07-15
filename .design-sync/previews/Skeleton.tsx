import { Skeleton } from 'agecob-lens';

export function KpiCardLoading() {
  return (
    <div className="flex flex-col gap-2 max-w-sm">
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-8 w-full" />
      <Skeleton className="h-3" style={{ width: '60%' }} />
    </div>
  );
}

export function TableRowsLoading() {
  return (
    <div className="flex flex-col gap-2 max-w-md">
      <Skeleton className="h-4" style={{ width: '40%' }} />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-full" />
    </div>
  );
}

export function AvatarLoading() {
  return (
    <div className="flex items-center gap-3">
      <Skeleton className="h-10 w-10 rounded-full" />
      <div className="flex flex-col gap-2">
        <Skeleton className="h-3" style={{ width: '120px' }} />
        <Skeleton className="h-3" style={{ width: '80px' }} />
      </div>
    </div>
  );
}
