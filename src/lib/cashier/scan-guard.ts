/** Client-side duplicate scan guard (pure, unit-tested). */
export function shouldAcceptScan(params: {
  token: string;
  lastToken: string;
  lastAtMs: number;
  nowMs: number;
  cooldownMs?: number;
}): boolean {
  const token = params.token.trim();
  if (!token) return false;
  const cooldown = params.cooldownMs ?? 4000;
  if (token === params.lastToken && params.nowMs - params.lastAtMs < cooldown) {
    return false;
  }
  return true;
}
