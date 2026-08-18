type ReauthListener = (open: boolean) => void;

interface ReauthWaiter {
  resolve: () => void;
  reject: (err: Error) => void;
}

let reauthOpen = false;
let listeners: ReauthListener[] = [];
let waiters: ReauthWaiter[] = [];

function notify() {
  listeners.forEach((listener) => listener(reauthOpen));
}

/** Subscribe to re-auth dialog open/close state. */
export function subscribeReauth(listener: ReauthListener): () => void {
  listeners.push(listener);
  listener(reauthOpen);
  return () => {
    listeners = listeners.filter((l) => l !== listener);
  };
}

export function isReauthOpen(): boolean {
  return reauthOpen;
}

/**
 * Block the caller until the user signs in again via the re-auth dialog.
 * Multiple concurrent 401s share one dialog and all resume after login.
 */
export function waitForReauth(): Promise<void> {
  return new Promise((resolve, reject) => {
    waiters.push({ resolve, reject });
    if (!reauthOpen) {
      reauthOpen = true;
      notify();
    }
  });
}

export function completeReauth(): void {
  reauthOpen = false;
  notify();
  const pending = waiters;
  waiters = [];
  pending.forEach((w) => w.resolve());
}

export function cancelReauth(reason = 'Sign-in cancelled'): void {
  reauthOpen = false;
  notify();
  const pending = waiters;
  waiters = [];
  const err = new Error(reason);
  pending.forEach((w) => w.reject(err));
}

export function isUnauthorizedResponse(status: number, body: string): boolean {
  if (status === 401) return true;
  const lower = body.toLowerCase();
  return lower.includes('authentication required') || lower.includes('not authenticated');
}
