import { pino, type Logger } from "pino";

/**
 * ログは標準エラーに出す。標準出力は結果（宛先の ID・組み立てた依頼の文）だけに使い、
 * crew の出力を別の命令がそのまま受け取れるようにする。
 */
export function createLogger(level = process.env["CREW_LOG_LEVEL"] ?? "info"): Logger {
  return pino({ level, base: null }, pino.destination(2));
}

/** 試験と、ログを出さない呼び出しのため。 */
export const silentLogger: Logger = pino({ level: "silent" });
