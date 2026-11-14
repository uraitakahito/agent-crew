export type Sleep = (ms: number) => Promise<void>;

export const realSleep: Sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export interface PollOptions {
  /** 何回まで見るか（1 回目を含む）。 */
  readonly attempts: number;
  /** 見る間の待ち。 */
  readonly intervalMs: number;
  readonly sleep: Sleep;
}

/**
 * check が undefined 以外を返すまで繰り返す。時間ではなく回数で数えるので、試験は sleep を
 * 差し替えるだけで待たずに進められる（偽の時計に頼らない）。
 */
export async function pollUntil<T>(
  check: () => Promise<T | undefined>,
  options: PollOptions,
): Promise<T | undefined> {
  for (let attempt = 1; attempt <= options.attempts; attempt += 1) {
    const result = await check();
    if (result !== undefined) return result;
    if (attempt < options.attempts) await options.sleep(options.intervalMs);
  }
  return undefined;
}
