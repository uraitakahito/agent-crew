import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadProfile } from "../src/profile/profile.js";
import { render } from "../src/render/render.js";
import { buildRequest, parseVars } from "../src/templates.js";

const REPO = join(import.meta.dirname, "..");
const profile = loadProfile(join(REPO, "profiles", "example"));

describe("--var", () => {
  it("鍵=値 を読み、値の中の = はそのまま残す", () => {
    expect(parseVars(["a=1", "url=https://example.com/?x=1"])).toEqual({
      a: "1",
      url: "https://example.com/?x=1",
    });
  });

  it("形の違う物と、同じ鍵の 2 度目を止める", () => {
    expect(() => parseVars(["novalue"])).toThrow(/鍵=値/);
    expect(() => parseVars(["a=1", "a=2"])).toThrow(/2 度/);
  });
});

describe("依頼の文の出どころ", () => {
  const read = (path: string) => `手書き:${path}`;

  it("--template と --request の両方なら止める", () => {
    expect(() =>
      buildRequest(REPO, profile, { template: "plan", request: "x", vars: [] }, read),
    ).toThrow(/片方だけ/);
  });

  it("--var だけなら止める", () => {
    expect(() => buildRequest(REPO, profile, { vars: ["a=1"] }, read)).toThrow(/--template と一緒/);
  });

  it("どちらも無ければ依頼は無し、--request なら手書きの文", () => {
    expect(buildRequest(REPO, profile, { vars: [] }, read)).toBeUndefined();
    expect(buildRequest(REPO, profile, { request: "r.md", vars: [] }, read)).toBe("手書き:r.md");
  });

  it("無い雛形は名前を言って止める", () => {
    expect(() => buildRequest(REPO, profile, { template: "nope", vars: [] }, read)).toThrow(
      /雛形 "nope" が無い/,
    );
  });
});

describe("任意の穴", () => {
  it("{{?名前}} は値が無ければ空にし、在れば替える", () => {
    expect(render("a{{?x}}b", { values: {} }, "t")).toBe("ab");
    expect(render("a{{?x}}b", { values: { x: "-" } }, "t")).toBe("a-b");
  });
});

/**
 * 雛形ごとに、必ず入るべき決まり（部品の見出し）。部品を外すと、ここが赤になる。
 * 一覧は計画の「部品にする決まり」の表と同じ。
 */
const ALL = [
  "## 作業項目の状態",
  "## 結果のまとめ方",
  "## 開く場所",
  "## Product Manager への問い合わせ",
  "## このプロジェクトの決まり",
  "## 終わったら",
];
const READ_ONLY = ["## 範囲"];
const CHANGING = ["## 後方互換", "## 共有の開発環境", "## docs とコメントの食い違い"];
const DRIFT = ["## docs とコメントの食い違い"];
const REQUIRED: Record<string, string[]> = {
  explain: [...ALL, ...READ_ONLY, ...DRIFT],
  propose: [...ALL, ...READ_ONLY, ...CHANGING, "## 案を出す前に"],
  plan: [
    ...ALL,
    ...READ_ONLY,
    ...CHANGING,
    "## 作業の場所",
    "## 版",
    "## 並列の作業",
    "## 計画の書き方",
  ],
  execute: [
    ...ALL,
    ...CHANGING,
    "## 決めてほしいことの答え",
    "## 作業の場所",
    "## 版",
    "## 並列の作業",
    "## 進め方",
    "## 残りの登録",
  ],
};

const VARS: Record<string, string[]> = {
  explain: ["ticket=#1", "topic=見本の題", "question=見本の問い"],
  propose: ["ticket=#1", "topic=見本の題", "options=3"],
  plan: ["ticket=#1", "topic=見本の題", "proposal=<提案の URL>", "choice=案 2"],
  execute: ["ticket=#1", "topic=見本の題", "plan=<計画の URL>", "answers=無し（全部既定）"],
};

describe("依頼の雛形", () => {
  it.each(Object.keys(REQUIRED))("%s は必ず入るべき決まりを全部持ち、穴が残らない", (name) => {
    const text = buildRequest(REPO, profile, { template: name, vars: VARS[name] ?? [] }, () => "");
    for (const heading of REQUIRED[name] ?? []) expect(text).toContain(heading);
    expect(text).not.toMatch(/\{\{|\}\}/);
    expect(text).not.toMatch(/\n{3,}/);
  });

  it.each(Object.keys(REQUIRED))("%s を見本の値で組み立てた文は、正の文と同じ", async (name) => {
    const text = buildRequest(REPO, profile, { template: name, vars: VARS[name] ?? [] }, () => "");
    await expect(text).toMatchFileSnapshot(`golden/${name}.md`);
  });

  it("雛形が受けない --var は、受ける名前を挙げて止まる", () => {
    const vars = [...(VARS["plan"] ?? []), "question=x"];
    expect(() => buildRequest(REPO, profile, { template: "plan", vars }, () => "")).toThrow(
      /--var question を受けない/,
    );
  });

  it("profile の値の鍵は --var で替えられる", () => {
    const vars = [...(VARS["plan"] ?? []), "issueTracker=別の置き場"];
    expect(buildRequest(REPO, profile, { template: "plan", vars }, () => "")).toContain(
      "別の置き場",
    );
  });

  it("雛形に要る値が --var に無ければ、その名前を言って止まる", () => {
    expect(() =>
      buildRequest(REPO, profile, { template: "plan", vars: ["ticket=#1", "topic=T"] }, () => ""),
    ).toThrow(/proposal・choice/);
  });
});
