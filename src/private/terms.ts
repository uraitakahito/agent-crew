import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

/**
 * repo の外に置く語の一覧。本物の値を literal で照らしたいとき（手元の機械だけ）に使う。
 *
 * 形の規則（`src/private/rules.ts`）だけでは拾えない物（プロジェクトの名前・機械の名前など）を
 * 1 行に 1 つ書く。`#` で始まる行と空の行は読まない。CI には無いので、CI は形だけで探す。
 */
export const TERMS_ENV = "AGENT_CREW_PRIVATE_TERMS";

export function defaultTermsPath(home = homedir()): string {
  return join(home, ".config", "agent-crew", "private-terms.txt");
}

export function parseTerms(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== "" && !line.startsWith("#"));
}

/** 一覧が無ければ null（在るのに読めなければ投げる）。 */
export function loadTerms(path: string): string[] | null {
  try {
    return parseTerms(readFileSync(path, "utf8"));
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return null;
    throw error;
  }
}
