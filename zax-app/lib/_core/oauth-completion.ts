/** Share one authoritative OAuth completion across repeated effect subscriptions. */
export function createOAuthCompletion() {
  let current: { key: string; promise: Promise<void> } | undefined;
  return (key: string, complete: () => Promise<void>): Promise<void> => {
    if (!current || current.key !== key) {
      current = { key, promise: Promise.resolve().then(complete) };
    }
    return current.promise;
  };
}
