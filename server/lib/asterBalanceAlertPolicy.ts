export const ASTER_BALANCE_ALERT_COOLDOWN_MS = 6 * 60 * 60 * 1000;

export function shouldNotifyAsterBalanceFloor(input: {
  enabled: number;
  floor: number;
  balance: number;
  lastNotifiedAt?: Date | null;
  now?: number;
}): boolean {
  if (input.enabled !== 1 || input.floor <= 0 || !Number.isFinite(input.balance)) return false;
  if (input.balance >= input.floor) return false;
  const last = input.lastNotifiedAt?.getTime();
  if (!last) return true;
  return (input.now ?? Date.now()) - last >= ASTER_BALANCE_ALERT_COOLDOWN_MS;
}
