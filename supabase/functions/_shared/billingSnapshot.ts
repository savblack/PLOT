/** Refetch Stripe after any competing database commit, including equal-second events. */
export async function reconcileBillingSnapshot<T>(
  readRevision: () => Promise<number | null>,
  fetchSnapshot: () => Promise<T>,
  apply: (snapshot: T, revision: number | null) => Promise<{ retry?: boolean }>,
) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const revision = await readRevision();
    const snapshot = await fetchSnapshot();
    const result = await apply(snapshot, revision);
    if (!result.retry) return result;
  }
  throw new Error('Concurrent billing updates require a retry');
}
