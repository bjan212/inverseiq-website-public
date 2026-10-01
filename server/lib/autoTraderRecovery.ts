type RecoveryJob = { taskUid: string };

export type AutoTraderRecoveryDeps = {
  updateExisting: (taskUid: string) => Promise<unknown>;
  createReplacement: () => Promise<RecoveryJob>;
  persistTaskUid: (taskUid: string) => Promise<unknown>;
};

export function isMissingRecoveryTaskError(error: unknown): boolean {
  const code = String((error as { code?: unknown })?.code ?? "");
  const message = String((error as { message?: unknown })?.message ?? error ?? "");
  return code === "NOT_FOUND" || /(?:failed\s*\(404\)|not found|does not exist|unknown task)/i.test(message);
}

/**
 * Enable an existing durable recovery task or recreate it only when the
 * platform confirms the persisted task UID no longer exists.
 */
export async function ensureAutoTraderRecoveryTask(
  existingTaskUid: string | null | undefined,
  deps: AutoTraderRecoveryDeps,
): Promise<{ taskUid: string; recreated: boolean }> {
  if (existingTaskUid) {
    try {
      await deps.updateExisting(existingTaskUid);
      return { taskUid: existingTaskUid, recreated: false };
    } catch (error) {
      if (!isMissingRecoveryTaskError(error)) throw error;
    }
  }

  const replacement = await deps.createReplacement();
  if (!replacement?.taskUid) throw new Error("Recovery task creation returned no task UID");
  await deps.persistTaskUid(replacement.taskUid);
  return { taskUid: replacement.taskUid, recreated: Boolean(existingTaskUid) };
}
