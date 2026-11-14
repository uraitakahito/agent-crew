import { describe, expect, it } from "vitest";
import { RULES } from "../src/private/rules.js";
import { isBinary, mask, scanText, termRules } from "../src/private/scan.js";
import { parseTerms } from "../src/private/terms.js";

// 見本の値は、この試験のファイル自体が check:private に当たらないよう、実行の時に組み立てる。
const j = (...parts: string[]) => parts.join("");

const ids = (text: string) => scanText("t", text, RULES).map((f) => f.ruleId);

describe("形の規則", () => {
  it("UUID を拾い、見本の頭の UUID は見逃す", () => {
    expect(ids(j("id=1b4e28ba", "-2fa1-11d2-883f-", "0016d3cca427"))).toEqual(["uuid"]);
    expect(ids(j("00000000-0000-", "4000-8000-000000000001"))).toEqual([]);
  });

  it("4 桁以上の端末の参照を拾い、3 桁までは見逃す", () => {
    expect(ids(j("workspace", ":", "1000030003"))).toEqual(["cmux-ref"]);
    expect(ids(j("surface", ":", "1234"))).toEqual(["cmux-ref"]);
    expect(ids(j("workspace", ":", "7"))).toEqual([]);
    expect(ids("workspace:<番号>")).toEqual([]);
  });

  it("利用者の名前を含む絶対パスを拾い、~ と <…> の形は見逃す", () => {
    expect(ids(j("/Us", "ers/alice/projects"))).toEqual(["home-path"]);
    expect(ids(j("/ho", "me/bob/.config"))).toEqual(["home-path"]);
    expect(ids("~/projects/agent-crew と /Users/<名前>/")).toEqual([]);
  });

  it("メールアドレスを拾い、予約の domain と公開のアドレスは見逃す", () => {
    expect(ids(j("alice", "@", "corp.co.jp"))).toEqual(["email"]);
    expect(ids("someone@example.com・a@b.test・noreply@anthropic.com")).toEqual([]);
  });

  it("パッケージの版の書き方（名前@版）はメールアドレスと見なさない", () => {
    expect(ids("vitest@5.1.0 @types/node@26.6.6 pnpm@11.26.0+sha512.abc")).toEqual([]);
  });

  it("課題管理の URL とキーを拾い、UTF-8 や SHA-256 は見逃す", () => {
    expect(ids(j("https://acme", ".atlassian", ".net/browse"))).toEqual(["issue-tracker-url"]);
    expect(ids(j("PROJ", "-123 を直す"))).toEqual(["issue-key"]);
    expect(ids("UTF-8・SHA-256・ISO-8601・RFC-2606")).toEqual([]);
  });

  it("claude.ai の Artifact のリンクを拾い、session の署名の行は見逃す", () => {
    expect(ids(j("https://claude", ".ai/artifact/", "AbC123"))).toEqual(["claude-link"]);
    expect(ids(j("https://claude", ".ai/code/session_", "01abc"))).toEqual([]);
  });

  it("1 行に 2 つ在れば 2 件を返し、行の番号を数える", () => {
    const text = j("ok\n", "a", "@", "corp.jp b", "@", "corp.jp");
    const found = scanText("f", text, RULES);
    expect(found.map((f) => [f.line, f.ruleId])).toEqual([
      [2, "email"],
      [2, "email"],
    ]);
  });
});

describe("外の語の一覧", () => {
  it("注記と空の行を飛ばして読む", () => {
    expect(parseTerms("# 注記\n\nfoo-project\n  bar \n")).toEqual(["foo-project", "bar"]);
  });

  it("語を大文字と小文字を区別せずに literal で照らす", () => {
    const rules = termRules(["foo.project"]);
    expect(scanText("f", "see FOO.PROJECT here", rules)).toHaveLength(1);
    // `.` を正規表現として読まない
    expect(scanText("f", "fooXproject", rules)).toHaveLength(0);
  });
});

describe("出し方", () => {
  it("見つけた値は頭だけを残して伏せる", () => {
    const masked = mask("1234567890");
    expect(masked.startsWith("12")).toBe(true);
    expect(masked).not.toContain("345");
  });

  it("NUL を含む物を文字の無いファイルと見なす", () => {
    expect(isBinary(new Uint8Array([65, 0, 66]))).toBe(true);
    expect(isBinary(new TextEncoder().encode("abc"))).toBe(false);
  });
});
