import { describe, expect, it } from "vitest";
import { LoadQueue } from "./loadQueue";

describe("LoadQueue.cancelScope", () => {
  it("rejects queued promises of the cancelled scope and keeps the queue alive", async () => {
    const queue = new LoadQueue(1);
    let releaseBlocker!: () => void;
    const blockerDone = queue.enqueue(
      "blocker",
      "outro",
      "high",
      () =>
        new Promise<string>((resolve) => {
          releaseBlocker = () => resolve("blocker");
        }),
    );

    const runs: string[] = [];
    const cancelled = ["a", "b", "c"].map((id) =>
      queue.enqueue(id, "pagina", "normal", async () => {
        runs.push(id);
        return id;
      }),
    );

    queue.cancelScope("pagina");

    const results = await Promise.allSettled(cancelled);
    for (const result of results) {
      expect(result.status).toBe("rejected");
      const reason = (result as PromiseRejectedResult).reason;
      expect(reason).toBeInstanceOf(Error);
      expect((reason as Error).message).toBe("cancelled: pagina");
    }
    expect(runs).toEqual([]);

    releaseBlocker();
    await expect(blockerDone).resolves.toBe("blocker");

    await expect(
      queue.enqueue("d", "pagina", "normal", async () => "d"),
    ).resolves.toBe("d");
  });
});
