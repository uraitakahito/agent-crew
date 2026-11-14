import { readFileSync } from "node:fs";
import { join } from "node:path";
import { CrewError } from "./errors.js";
import type { Profile } from "./profile/profile.js";
import { render, splitFrontMatter } from "./render/render.js";
import { readPartial } from "./roles.js";

/** 依頼の雛形。名前は templates/<名前>.md。 */
export const TEMPLATE_FIELDS = ["title", "description", "vars"] as const;

export interface TemplateVars {
  /** --var で必ず渡す物。 */
  readonly required: readonly string[];
  /** 渡さなくてよい物（頭の vars で名前の後ろに ? を付けた物）。 */
  readonly optional: readonly string[];
}

/** 雛形の頭の `vars: a, b, notes?` を読む。 */
export function parseTemplateVars(field: string | undefined): TemplateVars {
  const names = (field ?? "")
    .split(",")
    .map((n) => n.trim())
    .filter((n) => n !== "");
  return {
    required: names.filter((n) => !n.endsWith("?")),
    optional: names.filter((n) => n.endsWith("?")).map((n) => n.slice(0, -1)),
  };
}

export interface LoadedTemplate {
  readonly name: string;
  readonly source: string;
  readonly vars: TemplateVars;
  readonly body: string;
}

export function loadTemplate(repoDir: string, name: string): LoadedTemplate {
  if (!/^[a-z][a-z0-9-]*$/.test(name))
    throw new CrewError(`雛形の名前 "${name}" は英小文字と - だけにする`);
  const source = `templates/${name}.md`;
  let text: string;
  try {
    text = readFileSync(join(repoDir, source), "utf8");
  } catch {
    throw new CrewError(`雛形 "${name}" が無い: ${join(repoDir, source)}`);
  }
  const { fields, body } = splitFrontMatter(text, source);
  for (const key of Object.keys(fields)) {
    if (!(TEMPLATE_FIELDS as readonly string[]).includes(key)) {
      throw new CrewError(
        `${source} の頭に書けない鍵 "${key}"（書けるのは ${TEMPLATE_FIELDS.join("・")}）`,
      );
    }
  }
  return { name, source, vars: parseTemplateVars(fields["vars"]), body };
}

/** `--var 鍵=値` を読む。同じ鍵を 2 度渡したら止める。 */
export function parseVars(list: readonly string[]): Record<string, string> {
  const vars: Record<string, string> = {};
  for (const item of list) {
    const at = item.indexOf("=");
    if (at <= 0) throw new CrewError(`--var は 鍵=値 の形にする（渡されたのは "${item}"）`);
    const key = item.slice(0, at).trim();
    if (!/^[A-Za-z][\w.-]*$/.test(key))
      throw new CrewError(`--var の鍵 "${key}" は英字で始め、英数字と . _ - だけにする`);
    if (Object.hasOwn(vars, key)) throw new CrewError(`--var ${key} を 2 度渡している`);
    vars[key] = item.slice(at + 1);
  }
  return vars;
}

export function renderTemplate(
  repoDir: string,
  name: string,
  profile: Profile,
  vars: Readonly<Record<string, string>>,
): string {
  const template = loadTemplate(repoDir, name);
  const missing = template.vars.required.filter((v) => !Object.hasOwn(vars, v));
  if (missing.length > 0) {
    throw new CrewError(`雛形 ${name} に要る --var が無い: ${missing.join("・")}`);
  }
  const accepted = new Set([
    ...template.vars.required,
    ...template.vars.optional,
    ...Object.keys(profile.values),
  ]);
  const unknown = Object.keys(vars).filter((v) => !accepted.has(v));
  if (unknown.length > 0) {
    const names = [...template.vars.required, ...template.vars.optional].join("・");
    throw new CrewError(
      `雛形 ${name} は --var ${unknown.join("・")} を受けない（受けるのは ${names} と、profile の values の鍵）`,
    );
  }
  // --var は profile の値より先（そのときだけ値を替えたいときのため）。
  // 任意の穴（{{?…}}）が空のときに残る空の行を詰める。
  return render(
    template.body,
    {
      values: { ...profile.values, ...vars },
      partial: (p) => readPartial(repoDir, p, profile.dir),
    },
    template.source,
  )
    .replace(/\n{3,}/g, "\n\n")
    .replace(/^\n+/, "");
}

export interface RequestSource {
  readonly template?: string;
  readonly request?: string;
  readonly vars: readonly string[];
}

/** 依頼の文を、雛形か、手書きのファイルのどちらかから作る。どちらも無ければ undefined。 */
export function buildRequest(
  repoDir: string,
  profile: Profile,
  source: RequestSource,
  readRequestFile: (path: string) => string,
): string | undefined {
  if (source.template !== undefined && source.request !== undefined) {
    throw new CrewError("--template と --request は片方だけにしてください");
  }
  if (source.template === undefined && source.vars.length > 0) {
    throw new CrewError("--var は --template と一緒に使う");
  }
  if (source.template !== undefined)
    return renderTemplate(repoDir, source.template, profile, parseVars(source.vars));
  if (source.request !== undefined) return readRequestFile(source.request);
  return undefined;
}
