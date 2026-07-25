import { processPoll, type IndexerDeps } from "@startip/shared/indexer/dispatch";
import { sweepExpiredLiveEvents } from "@startip/shared/live-events/sweep";

/**
 * Start the indexer poll loop. Calls `processPoll` every `pollMs`
 * milliseconds and sweeps expired Live Events on each successful poll.
 * Errors are logged and swallowed so one failed tick does not kill the loop.
 * Returns a `stop()` function that halts the loop (used for graceful shutdown).
 */

export function startIndexerLoop<R extends IndexerDeps["rpc"]>(
  deps: IndexerDeps<R>,
  pollMs: number,
): () => void {
  let running = true;
  let timer: ReturnType<typeof setTimeout> | null = null;

  async function tick(): Promise<void> {
    if (!running) return;
    try {
      const result = await processPoll(deps, {});
      console.log(
        `[indexer] poll processed=${result.processed} lastLedger=${result.lastLedger ?? "-"} cursor=${result.cursor ?? "-"}`,
      );

      const sweep = await sweepExpiredLiveEvents(deps.supabase, new Date().toISOString());
      if (sweep.error) {
        console.error("[indexer] live event sweep failed", sweep.error);
      } else if (sweep.updated > 0) {
        console.log(`[indexer] live event sweep updated=${sweep.updated}`);
      }
    } catch (err) {
      console.error("[indexer] poll failed", err);
    }
    if (running) {
      timer = setTimeout(() => void tick(), pollMs);
    }
  }

  void tick();

  return () => {
    running = false;
    if (timer) clearTimeout(timer);
  };
}
