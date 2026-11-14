/** POSIX の shell の一重引用符で包む（中の `'` は `'\''` に替える）。 */
export function shellQuote(value: string): string {
  if (/^[A-Za-z0-9_./:=@%+-]+$/.test(value)) return value;
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

/** 端末に打ち込む命令の長さの上限（cmux の new-workspace の --command は、これを超えると黙って実行されない）。 */
export const COMMAND_MAX_BYTES = 1024;

export function byteLength(text: string): number {
  return Buffer.byteLength(text, "utf8");
}
