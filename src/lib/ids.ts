export function createId(prefix: string): string {
  const random = crypto.getRandomValues(new Uint8Array(8));
  const suffix = Array.from(random, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${prefix}_${Date.now().toString(36)}_${suffix}`;
}

export function nowIso(): string {
  return new Date().toISOString();
}
