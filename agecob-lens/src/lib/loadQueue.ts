import type { LoadPriority } from "@/config/loadPriorities";

type QueueTask<T> = {
  id: string;
  scope: string;
  priority: LoadPriority;
  run: () => Promise<T>;
  resolve: (value: T) => void;
  reject: (reason?: unknown) => void;
  cancelled: boolean;
};

const PRIORITY_WEIGHT: Record<LoadPriority, number> = {
  high: 0,
  normal: 1,
  low: 2,
};

class LoadQueue {
  private readonly maxConcurrency: number;
  private active = 0;
  private queue: Array<QueueTask<unknown>> = [];

  constructor(maxConcurrency = 2) {
    this.maxConcurrency = maxConcurrency;
  }

  enqueue<T>(
    id: string,
    scope: string,
    priority: LoadPriority,
    run: () => Promise<T>,
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const task: QueueTask<T> = { id, scope, priority, run, resolve, reject, cancelled: false };
      this.queue.push(task as QueueTask<unknown>);
      this.queue.sort(
        (a, b) => PRIORITY_WEIGHT[a.priority] - PRIORITY_WEIGHT[b.priority],
      );
      this.pump();
    });
  }

  cancelScope(scope: string): void {
    this.queue.forEach((task) => {
      if (task.scope === scope) task.cancelled = true;
    });
    this.queue = this.queue.filter((task) => task.scope !== scope);
  }

  private pump(): void {
    while (this.active < this.maxConcurrency && this.queue.length > 0) {
      const task = this.queue.shift();
      if (!task || task.cancelled) continue;
      this.active += 1;
      task
        .run()
        .then((result) => task.resolve(result))
        .catch((error) => task.reject(error))
        .finally(() => {
          this.active -= 1;
          this.pump();
        });
    }
  }
}

export const loadQueue = new LoadQueue(2);
