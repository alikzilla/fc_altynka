export function isGameRosterLocked(error: unknown): boolean {
  for (let cause = error as { message?: string; cause?: unknown } | undefined; cause; cause = cause.cause as typeof cause) {
    if (String(cause.message ?? '').includes('game_roster_locked')) return true;
  }
  return false;
}

export async function guardRosterMutation<T>(operation: () => Promise<T>, closed: T): Promise<T> {
  try { return await operation(); }
  catch (error) { if (isGameRosterLocked(error)) return closed; throw error; }
}
