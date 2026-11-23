const enc = new TextEncoder();

/** Constant-time comparison of secret strings: both are hashed to the same length first, so neither length nor prefix leaks. */
export async function sameSecret(given: string | undefined, expected: string): Promise<boolean> {
  if (given === undefined || !expected) return false;
  const [a, b] = await Promise.all([crypto.subtle.digest('SHA-256', enc.encode(given)), crypto.subtle.digest('SHA-256', enc.encode(expected))]);
  return crypto.subtle.timingSafeEqual(a, b);
}
