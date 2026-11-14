import type { Rule } from "./rules.js";

export interface Finding {
  readonly source: string;
  readonly line: number;
  readonly ruleId: string;
  /** 一致した値の頭だけを残して伏せた物。CI の記録は公開なので、値そのものは出さない。 */
  readonly masked: string;
}

export function mask(value: string): string {
  const keep = Math.min(2, Math.floor(value.length / 4));
  return `${value.slice(0, keep)}${"*".repeat(Math.max(3, value.length - keep))}`;
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** 外の語の一覧を、大文字と小文字を区別しない規則に変える。 */
export function termRules(terms: readonly string[]): Rule[] {
  return terms.map((term, index) => ({
    id: `private-term#${index + 1}`,
    description: "外の語の一覧の語",
    pattern: new RegExp(escapeRegExp(term), "gi"),
  }));
}

export function scanText(source: string, text: string, rules: readonly Rule[]): Finding[] {
  const findings: Finding[] = [];
  const lines = text.split("\n");
  lines.forEach((content, index) => {
    for (const rule of rules) {
      for (const match of content.matchAll(rule.pattern)) {
        if (rule.allow?.(match[0])) continue;
        findings.push({ source, line: index + 1, ruleId: rule.id, masked: mask(match[0]) });
      }
    }
  });
  return findings;
}

/** NUL を含む物は文字の無いファイルとして飛ばす。 */
export function isBinary(bytes: Uint8Array): boolean {
  return bytes.includes(0);
}
