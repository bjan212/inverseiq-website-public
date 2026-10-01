import { describe, expect, it, vi } from "vitest";
import { ensureAutoTraderRecoveryTask, isMissingRecoveryTaskError } from "./lib/autoTraderRecovery";

describe("Auto Trader durable recovery preparation", () => {
  it("re-enables a valid persisted recovery task without creating a duplicate", async () => {
    const updateExisting = vi.fn().mockResolvedValue(undefined);
    const createReplacement = vi.fn();
    const persistTaskUid = vi.fn();

    await expect(ensureAutoTraderRecoveryTask("existing-task", {
      updateExisting,
      createReplacement,
      persistTaskUid,
    })).resolves.toEqual({ taskUid: "existing-task", recreated: false });

    expect(updateExisting).toHaveBeenCalledWith("existing-task");
    expect(createReplacement).not.toHaveBeenCalled();
    expect(persistTaskUid).not.toHaveBeenCalled();
  });

  it("recreates and persists a task only after a confirmed NOT_FOUND response", async () => {
    const missing = Object.assign(new Error("Heartbeat UpdateHeartbeatJob failed (404): task not found"), { code: "NOT_FOUND" });
    const createReplacement = vi.fn().mockResolvedValue({ taskUid: "replacement-task" });
    const persistTaskUid = vi.fn().mockResolvedValue(undefined);

    await expect(ensureAutoTraderRecoveryTask("stale-task", {
      updateExisting: vi.fn().mockRejectedValue(missing),
      createReplacement,
      persistTaskUid,
    })).resolves.toEqual({ taskUid: "replacement-task", recreated: true });

    expect(createReplacement).toHaveBeenCalledTimes(1);
    expect(persistTaskUid).toHaveBeenCalledWith("replacement-task");
  });

  it("does not create a possible duplicate after transient or authorization failures", async () => {
    const createReplacement = vi.fn();
    await expect(ensureAutoTraderRecoveryTask("existing-task", {
      updateExisting: vi.fn().mockRejectedValue(Object.assign(new Error("network timeout"), { code: "INTERNAL_SERVER_ERROR" })),
      createReplacement,
      persistTaskUid: vi.fn(),
    })).rejects.toThrow("network timeout");
    expect(createReplacement).not.toHaveBeenCalled();
  });

  it("creates and persists a task when no task UID was previously stored", async () => {
    const persistTaskUid = vi.fn().mockResolvedValue(undefined);
    await expect(ensureAutoTraderRecoveryTask(null, {
      updateExisting: vi.fn(),
      createReplacement: vi.fn().mockResolvedValue({ taskUid: "new-task" }),
      persistTaskUid,
    })).resolves.toEqual({ taskUid: "new-task", recreated: false });
    expect(persistTaskUid).toHaveBeenCalledWith("new-task");
  });

  it("recognizes only explicit missing-task errors", () => {
    expect(isMissingRecoveryTaskError({ code: "NOT_FOUND", message: "missing" })).toBe(true);
    expect(isMissingRecoveryTaskError(new Error("Heartbeat update failed (404)"))).toBe(true);
    expect(isMissingRecoveryTaskError(new Error("forbidden"))).toBe(false);
  });
});
