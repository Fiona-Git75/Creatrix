/**
 * Pending confirmation store.
 *
 * When a requiresConfirmation tool is about to execute, the chat route
 * emits a `confirm_required` SSE event and then awaits a Promise here.
 * The frontend POSTs to /api/confirm/:id to resolve it.
 * Auto-rejects after 2 minutes so the stream never hangs forever.
 */

const pending = new Map<string, (approved: boolean) => void>();
const TIMEOUT_MS = 120_000;

export function requestConfirmation(id: string): Promise<boolean> {
  return new Promise((resolve) => {
    pending.set(id, resolve);
    setTimeout(() => {
      if (pending.delete(id)) {
        resolve(false); // auto-cancel on timeout
      }
    }, TIMEOUT_MS);
  });
}

export function resolveConfirmation(id: string, approved: boolean): boolean {
  const resolve = pending.get(id);
  if (!resolve) return false;
  pending.delete(id);
  resolve(approved);
  return true;
}
