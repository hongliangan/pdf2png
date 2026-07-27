// Polls `url` with `fetch` until it returns 2xx, or rejects after `timeoutMs`.
// We use GET — Next's standalone server rejects HEAD, so a GET is the safe choice.

export async function waitForUrl(
  url: string,
  { timeoutMs = 30_000, intervalMs = 200 }: { timeoutMs?: number; intervalMs?: number } = {},
): Promise<void> {
  const start = Date.now();
  for (;;) {
    if (Date.now() - start > timeoutMs) {
      throw new Error(`waitForUrl: ${url} did not respond within ${timeoutMs}ms`);
    }
    try {
      const res = await fetch(url, { method: 'GET' });
      if (res.ok) return;
    } catch {
      // Server not up yet; fall through to wait.
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}
