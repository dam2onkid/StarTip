// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { IndexerDeps } from "@startip/shared/indexer/dispatch";
import { startIndexerLoop } from "./indexer";

/**
 * apps/worker/src/indexer — `startIndexerLoop` lifecycle.
 *
 * The loop calls `processPoll` from `@startip/shared/indexer/dispatch` on a
 * `setTimeout` interval. These tests mock `processPoll` and assert:
 *   - the loop starts immediately (first tick fires without waiting)
 *   - the loop reschedules after each tick
 *   - stop() halts the loop and no further ticks fire
 *   - a thrown error in one tick is logged and does not kill the loop
 */

vi.mock("@startip/shared/indexer/dispatch", () => ({
  processPoll: vi.fn(),
}));

const { processPoll } = await import("@startip/shared/indexer/dispatch");
const mockProcessPoll = vi.mocked(processPoll);

describe("startIndexerLoop", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockProcessPoll.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function makeDeps() {
    return {
      supabase: {} as never,
      rpc: {} as never,
      tokenReader: vi.fn(),
      contractId: "C-test",
    } as unknown as IndexerDeps;
  }

  it("fires the first poll immediately on start", async () => {
    mockProcessPoll.mockResolvedValue({ processed: 0, lastLedger: null, cursor: null });
    const stop = startIndexerLoop(makeDeps(), 10_000);
    // Flush the first tick's microtask.
    await vi.advanceTimersByTimeAsync(0);
    expect(mockProcessPoll).toHaveBeenCalledTimes(1);
    stop();
  });

  it("reschedules the next poll after pollMs", async () => {
    mockProcessPoll.mockResolvedValue({ processed: 1, lastLedger: 42, cursor: "cur" });
    const stop = startIndexerLoop(makeDeps(), 5_000);

    // First tick fires immediately.
    await vi.advanceTimersByTimeAsync(0);
    expect(mockProcessPoll).toHaveBeenCalledTimes(1);

    // Advance past the interval: second tick fires.
    await vi.advanceTimersByTimeAsync(5_000);
    expect(mockProcessPoll).toHaveBeenCalledTimes(2);

    // And a third.
    await vi.advanceTimersByTimeAsync(5_000);
    expect(mockProcessPoll).toHaveBeenCalledTimes(3);

    stop();
  });

  it("stop() halts the loop: no further ticks after stop", async () => {
    mockProcessPoll.mockResolvedValue({ processed: 0, lastLedger: null, cursor: null });
    const stop = startIndexerLoop(makeDeps(), 1_000);

    await vi.advanceTimersByTimeAsync(0);
    expect(mockProcessPoll).toHaveBeenCalledTimes(1);

    stop();
    // Advance well past the interval; no new tick should fire.
    await vi.advanceTimersByTimeAsync(10_000);
    expect(mockProcessPoll).toHaveBeenCalledTimes(1);
  });

  it("logs and swallows errors from processPoll without killing the loop", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    mockProcessPoll
      .mockRejectedValueOnce(new Error("rpc down"))
      .mockResolvedValueOnce({ processed: 2, lastLedger: 99, cursor: "cur2" });

    const stop = startIndexerLoop(makeDeps(), 1_000);

    // First tick: throws.
    await vi.advanceTimersByTimeAsync(0);
    expect(mockProcessPoll).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenCalledWith("[indexer] poll failed", expect.any(Error));

    // Second tick: succeeds (loop did not die).
    await vi.advanceTimersByTimeAsync(1_000);
    expect(mockProcessPoll).toHaveBeenCalledTimes(2);
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining("[indexer] poll processed=2"),
    );

    stop();
    errorSpy.mockRestore();
    logSpy.mockRestore();
  });
});
