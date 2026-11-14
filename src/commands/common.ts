import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { isDecider, type Decision } from "../decision.js";
import { CrewError } from "../errors.js";
import type { Profile } from "../profile/profile.js";
import { loadRole, writeRendered } from "../roles.js";

export interface DecisionOptions {
  readonly model?: string;
  readonly effort?: string;
  readonly decidedBy?: string;
  readonly reason?: string;
}

/**
 * モデル・effort・決めた人は毎回渡す。どれかが無ければ、推し量らずに止まる
 * （役の定義にも profile にも既定の値を持たせない）。
 */
export function requireDecision(options: DecisionOptions): Decision {
  const missing = [
    options.model === undefined ? "--model" : undefined,
    options.effort === undefined ? "--effort" : undefined,
    options.decidedBy === undefined ? "--decided-by" : undefined,
  ].filter((name) => name !== undefined);
  if (
    missing.length > 0 ||
    options.model === undefined ||
    options.effort === undefined ||
    options.decidedBy === undefined
  ) {
    throw new CrewError(
      `モデルと effort と決めた人を渡してください（足りない: ${missing.join("・")}）。決めるのは Product Manager の指定か TPM 役の判断です`,
    );
  }
  if (!isDecider(options.decidedBy)) {
    throw new CrewError(`--decided-by は pm か tpm（渡されたのは "${options.decidedBy}"）`);
  }
  return {
    model: options.model,
    effort: options.effort,
    decidedBy: options.decidedBy,
    ...(options.reason === undefined ? {} : { reason: options.reason }),
  };
}

/** 依頼の文をファイルから読む（`-` なら標準入力）。 */
export function readRequest(path: string, stdin: () => string): string {
  const text = path === "-" ? stdin() : readFileSafe(path, "依頼の文");
  if (text.trim() === "") throw new CrewError(`依頼の文が空: ${path}`);
  return text;
}

export function readFileSafe(path: string, what: string): string {
  try {
    return readFileSync(path, "utf8");
  } catch {
    throw new CrewError(`${what}が読めない: ${path}`);
  }
}

export interface PreparedRole {
  readonly name: string;
  /** --append-system-prompt-file に渡すファイル。 */
  readonly path: string;
  readonly permissionMode: string;
}

/**
 * --role <名前> は repo の roles/<名前>.md の穴を profile の値で埋め、repo の外に書いて渡す。
 * --role-file <パス> は、そのファイルをそのまま渡す（穴は埋めない）。
 */
export function prepareRole(
  repoDir: string,
  profile: Profile,
  role?: string,
  roleFile?: string,
  write: (name: string, text: string) => string = (name, text) =>
    writeRendered("roles", name, text),
): PreparedRole {
  if (role !== undefined && roleFile !== undefined) {
    throw new CrewError("--role と --role-file は片方だけにしてください");
  }
  if (roleFile !== undefined) {
    const path = resolve(roleFile);
    if (!existsSync(path)) throw new CrewError(`役のファイルが無い: ${path}`);
    return { name: "custom", path, permissionMode: profile.permissionMode };
  }
  if (role === undefined)
    throw new CrewError("役を渡してください（--role <名前> か --role-file <パス>）");
  const loaded = loadRole(repoDir, role, profile);
  return { name: role, path: write(role, loaded.text), permissionMode: loaded.permissionMode };
}
