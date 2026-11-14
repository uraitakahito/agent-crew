import { cpSync, existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { CrewError } from "../errors.js";
import { loadRole, readPartial } from "../roles.js";
import { loadTemplate, renderTemplate } from "../templates.js";
import { profilesRoot, type Profile } from "./profile.js";

/**
 * profile に要る物を、repo の役・雛形・部品の穴から割り出す（一覧を別に持たない。
 * 持てば、穴を足したときに一覧だけが古くなる）。
 */
export interface Requirements {
  /** profile の values の鍵 → 使っているファイル。 */
  readonly values: ReadonlyMap<string, readonly string[]>;
  /** repo に無い部品（profile の partials/ に要る）→ 使っているファイル。 */
  readonly partials: ReadonlyMap<string, readonly string[]>;
}

const HOLE = /\{\{\s*([>?]?)\s*([A-Za-z][\w.-]*)\s*\}\}/g;

function mdFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".md"))
    .sort();
}

function add(map: Map<string, string[]>, key: string, where: string): void {
  const list = map.get(key) ?? [];
  if (!list.includes(where)) list.push(where);
  map.set(key, list);
}

export function scanRequirements(repoDir: string): Requirements {
  const values = new Map<string, string[]>();
  const partials = new Map<string, string[]>();
  const templates = mdFiles(join(repoDir, "templates")).map((f) =>
    loadTemplate(repoDir, f.replace(/\.md$/, "")),
  );
  // 部品は雛形から読まれるので、どれかの雛形が --var で受ける名前は profile に要らない。
  const templateVars = new Set(templates.flatMap((t) => [...t.vars.required, ...t.vars.optional]));
  const files: { path: string; skip: Set<string> }[] = [
    ...mdFiles(join(repoDir, "roles")).map((f) => ({
      path: `roles/${f}`,
      skip: new Set<string>(),
    })),
    ...templates.map((t) => ({
      path: t.source,
      skip: new Set([...t.vars.required, ...t.vars.optional]),
    })),
    ...mdFiles(join(repoDir, "templates", "partials")).map((f) => ({
      path: `templates/partials/${f}`,
      skip: templateVars,
    })),
  ];
  for (const { path, skip } of files) {
    for (const m of readFileSync(join(repoDir, path), "utf8").matchAll(HOLE)) {
      const [, kind, name = ""] = m;
      if (kind === ">") {
        if (readPartial(repoDir, name) === undefined) add(partials, name, path);
      } else if (kind !== "?" && !skip.has(name)) {
        add(values, name, path);
      }
    }
  }
  return { values, partials };
}

export interface CheckResult {
  readonly missingValues: readonly { key: string; usedIn: readonly string[] }[];
  readonly missingPartials: readonly { name: string; usedIn: readonly string[] }[];
  readonly unusedValues: readonly string[];
  /** 役と雛形を見本の値で組み立てたときの失敗（上が空なら、ふつうは空）。 */
  readonly renderErrors: readonly string[];
}

export function checkProfile(repoDir: string, profile: Profile): CheckResult {
  const req = scanRequirements(repoDir);
  const missingValues = [...req.values]
    .filter(([key]) => !Object.hasOwn(profile.values, key))
    .map(([key, usedIn]) => ({ key, usedIn }));
  const missingPartials = [...req.partials]
    .filter(([name]) => readPartial(repoDir, name, profile.dir) === undefined)
    .map(([name, usedIn]) => ({ name, usedIn }));
  const unusedValues = Object.keys(profile.values).filter((key) => !req.values.has(key));
  const renderErrors: string[] = [];
  if (missingValues.length === 0 && missingPartials.length === 0) {
    for (const f of mdFiles(join(repoDir, "roles"))) {
      try {
        loadRole(repoDir, f.replace(/\.md$/, ""), profile);
      } catch (error) {
        renderErrors.push((error as Error).message);
      }
    }
    for (const f of mdFiles(join(repoDir, "templates"))) {
      const name = f.replace(/\.md$/, "");
      try {
        const t = loadTemplate(repoDir, name);
        renderTemplate(
          repoDir,
          name,
          profile,
          Object.fromEntries(t.vars.required.map((v) => [v, `<${v}>`])),
        );
      } catch (error) {
        renderErrors.push((error as Error).message);
      }
    }
  }
  return { missingValues, missingPartials, unusedValues, renderErrors };
}

export function formatCheck(
  result: CheckResult,
  profilePath: string,
): { ok: boolean; text: string } {
  const lines: string[] = [];
  for (const m of result.missingValues)
    lines.push(`✗ values に "${m.key}" が無い（使う所: ${m.usedIn.join("・")}）`);
  for (const m of result.missingPartials)
    lines.push(`✗ 部品 partials/${m.name}.md が無い（使う所: ${m.usedIn.join("・")}）`);
  for (const e of result.renderErrors) lines.push(`✗ ${e}`);
  for (const u of result.unusedValues) lines.push(`△ values の "${u}" はどこでも使っていない`);
  const ok =
    result.missingValues.length === 0 &&
    result.missingPartials.length === 0 &&
    result.renderErrors.length === 0;
  lines.push(
    ok ? `✓ ${profilePath} で、役と雛形を全部組み立てられる` : `${profilePath} を直してください`,
  );
  return { ok, text: `${lines.join("\n")}\n` };
}

/** 見本の profile を repo の外に写す。在れば上書きしない。 */
export function initProfile(repoDir: string, name: string, root = profilesRoot()): string {
  if (!/^[a-z][a-z0-9-]*$/.test(name))
    throw new CrewError(`profile の名前 "${name}" は英小文字と - だけにする`);
  const dest = join(root, name);
  if (existsSync(dest)) throw new CrewError(`${dest} はもう在る（上書きしない）`);
  cpSync(join(repoDir, "profiles", "example"), dest, { recursive: true });
  return dest;
}
