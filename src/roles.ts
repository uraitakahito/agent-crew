import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { homedir } from "node:os";
import { join } from "node:path";
import { CrewError } from "./errors.js";
import type { Profile } from "./profile/profile.js";
import { render, splitFrontMatter } from "./render/render.js";

/** 役の定義の頭に書けるのは、権限の持ち方だけ（モデルと effort は書かない）。 */
export const ROLE_FIELDS = ["title", "permissionMode"] as const;

export interface Role {
  readonly name: string;
  readonly title: string;
  /** `profile` なら profile の permissionMode を使う。 */
  readonly permissionMode: string;
  /** 穴を埋めた本文。 */
  readonly text: string;
}

export function parseRole(
  name: string,
  text: string,
  profile: Profile,
  source: string,
  partial?: (n: string) => string | undefined,
): Role {
  const { fields, body } = splitFrontMatter(text, source);
  for (const key of Object.keys(fields)) {
    if (!(ROLE_FIELDS as readonly string[]).includes(key)) {
      throw new CrewError(
        `${source} の頭に書けない鍵 "${key}"（書けるのは ${ROLE_FIELDS.join("・")}。モデルと effort は起こすときに渡す）`,
      );
    }
  }
  const title = fields["title"];
  if (title === undefined || title === "") throw new CrewError(`${source} の頭に title が無い`);
  const mode = fields["permissionMode"] ?? "profile";
  return {
    name,
    title,
    permissionMode: mode === "profile" ? profile.permissionMode : mode,
    text: render(
      body,
      { values: profile.values, ...(partial === undefined ? {} : { partial }) },
      source,
    ),
  };
}

export function loadRole(repoDir: string, name: string, profile: Profile): Role {
  const source = join(repoDir, "roles", `${name}.md`);
  let text: string;
  try {
    text = readFileSync(source, "utf8");
  } catch {
    throw new CrewError(`役 "${name}" の定義が無い: ${source}`);
  }
  return parseRole(name, text, profile, `roles/${name}.md`, (p) =>
    readPartial(repoDir, p, profile.dir),
  );
}

/**
 * 部品を読む。profile の partials/ に在ればそれを（プロジェクト固有の決まりなど）、
 * 無ければ repo の templates/partials/ の物を使う。
 */
export function readPartial(
  repoDir: string,
  name: string,
  profileDir?: string,
): string | undefined {
  const places = [
    ...(profileDir === undefined ? [] : [join(profileDir, "partials", `${name}.md`)]),
    join(repoDir, "templates", "partials", `${name}.md`),
  ];
  for (const path of places) {
    try {
      return readFileSync(path, "utf8");
    } catch {
      // 次の場所へ
    }
  }
  return undefined;
}

/** 組み立てた物を置く所（本物の値を含むので、repo の外）。 */
export function stateDir(home = homedir()): string {
  const base = process.env["XDG_STATE_HOME"] ?? join(home, ".local", "state");
  return join(base, "agent-crew");
}

/** 穴を埋めた役の定義をファイルに書き、そのパスを返す（--append-system-prompt-file に渡す）。 */
export function writeRendered(kind: string, name: string, text: string, dir = stateDir()): string {
  const hash = createHash("sha256").update(text).digest("hex").slice(0, 12);
  const folder = join(dir, kind);
  mkdirSync(folder, { recursive: true, mode: 0o700 });
  const path = join(folder, `${name}-${hash}.md`);
  writeFileSync(path, text, { mode: 0o600 });
  return path;
}
