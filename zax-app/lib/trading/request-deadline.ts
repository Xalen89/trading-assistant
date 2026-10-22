export const PROPOSAL_SERVER_MS = 25_000;
export const PROPOSAL_CLIENT_MS = 35_000;
export function boundedRequest<T>(
  work: Promise<T>,
  durationMs: number,
  message: string,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), durationMs);
    work.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}
