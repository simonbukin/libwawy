const MIN_INTERVAL_MS: Record<string, number> = {
  openlibrary: 200,
  google: 100,
  hardcover: 500,
  openbd: 0,
};

const lastRequest: Record<string, number> = {};

export async function throttle(providerId: string): Promise<void> {
  const interval = MIN_INTERVAL_MS[providerId] ?? 100;
  const last = lastRequest[providerId] ?? 0;
  const elapsed = Date.now() - last;

  if (elapsed < interval) {
    await new Promise((resolve) => setTimeout(resolve, interval - elapsed));
  }

  lastRequest[providerId] = Date.now();
}
