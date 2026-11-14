import { readFileSync } from "node:fs";
import { join } from "node:path";
import { CrewError } from "./errors.js";
import type { Profile } from "./profile/profile.js";
import { render, splitFrontMatter } from "./render/render.js";
import { readPartial } from "./roles.js";

/** 依頼の雛形。名前は templates/<名前>.md。 */
export const TEMPLATE_FIELDS = ["title", "description"] as const;

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
  // --var は profile の値より先（そのときだけ値を替えたいときのため）。
  // 任意の穴（{{?…}}）が空のときに残る空の行を詰める。
  return render(
    body,
    {
      values: { ...profile.values, ...vars },
      partial: (p) => readPartial(repoDir, p, profile.dir),
    },
    source,
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
