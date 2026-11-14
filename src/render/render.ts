import { CrewError } from "../errors.js";

/**
 * 雛形の穴埋め。書き方は 2 つだけ:
 *   {{名前}}      profile の values（と --var）の値に替える
 *   {{> 部品}}    部品のファイルの中身に替える（部品の中の穴も埋める）
 *   {{?名前}}     値が在れば替え、無ければ空にする（書き足しの欄など、任意の物だけ）
 * 埋まらない穴が 1 つでも在れば、全部の名前を挙げて止まる（黙って空にしない）。
 */
export interface RenderContext {
  readonly values: Readonly<Record<string, string>>;
  /** 部品の中身。無ければ undefined。 */
  readonly partial?: (name: string) => string | undefined;
}

const HOLE = /\{\{\s*([>?]?)\s*([A-Za-z][\w.-]*)\s*\}\}/g;
const MAX_DEPTH = 5;

export function render(text: string, context: RenderContext, source: string): string {
  const missing = new Set<string>();
  const missingPartials = new Set<string>();
  const out = expand(text, context, missing, missingPartials, 0);
  const problems: string[] = [];
  if (missing.size > 0) problems.push(`値の無い穴: ${[...missing].join("・")}`);
  if (missingPartials.size > 0) problems.push(`無い部品: ${[...missingPartials].join("・")}`);
  const stray = /\{\{|\}\}/.exec(out);
  if (problems.length === 0 && stray !== null) {
    const line = out.slice(0, stray.index).split("\n").length;
    problems.push(`読めない穴の書き方（${line} 行目の近く）`);
  }
  if (problems.length > 0) {
    throw new CrewError(
      `${source} を組み立てられない。${problems.join("。")}（profile の values か --var で渡してください）`,
    );
  }
  return out;
}

function expand(
  text: string,
  context: RenderContext,
  missing: Set<string>,
  missingPartials: Set<string>,
  depth: number,
): string {
  return text.replace(HOLE, (whole, isPartial: string, name: string) => {
    if (isPartial === ">") {
      const body = context.partial?.(name);
      if (body === undefined || depth >= MAX_DEPTH) {
        missingPartials.add(name);
        return whole;
      }
      return expand(body.replace(/\n$/, ""), context, missing, missingPartials, depth + 1);
    }
    const value = context.values[name];
    if (value === undefined && isPartial === "?") return "";
    if (value === undefined) {
      missing.add(name);
      return whole;
    }
    return value;
  });
}

export interface FrontMatter {
  readonly fields: Readonly<Record<string, string>>;
  readonly body: string;
}

/** 頭の `---` で挟んだ `鍵: 値` の行を読む（YAML の部分だけ。依存を足さないため）。 */
export function splitFrontMatter(text: string, source: string): FrontMatter {
  const m = /^---\n([\s\S]*?)\n---\n/.exec(text);
  if (m === null) return { fields: {}, body: text };
  const fields: Record<string, string> = {};
  for (const line of (m[1] ?? "").split("\n")) {
    if (line.trim() === "" || line.trimStart().startsWith("#")) continue;
    const kv = /^([A-Za-z][\w-]*):\s*(.*)$/.exec(line);
    if (kv === null) throw new CrewError(`${source} の頭の行が読めない: ${line}`);
    fields[kv[1] ?? ""] = (kv[2] ?? "").trim();
  }
  return { fields, body: text.slice(m[0].length) };
}
