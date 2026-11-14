import { readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { prepareRole } from "../src/commands/common.js";
import { loadProfile, type Profile } from "../src/profile/profile.js";
import { render, splitFrontMatter } from "../src/render/render.js";
import { loadRole, parseRole } from "../src/roles.js";

const REPO = join(import.meta.dirname, "..");
const profile = loadProfile(join(REPO, "profiles", "example"));
const ROLES = readdirSync(join(REPO, "roles")).map((f) => f.replace(/\.md$/, ""));

describe("穴埋め", () => {
  it("値の穴と部品の穴を埋め、部品の中の穴も埋める", () => {
    const out = render(
      "a={{x}} {{> p}}",
      { values: { x: "1", y: "2" }, partial: () => "y={{y}}\n" },
      "t",
    );
    expect(out).toBe("a=1 y=2");
  });

  it("値の無い穴を全部挙げて止まる", () => {
    expect(() => render("{{a}} {{b}} {{a}}", { values: {} }, "t.md")).toThrow(
      /t\.md.*値の無い穴: a・b/,
    );
  });

  it("無い部品を挙げて止まる", () => {
    expect(() => render("{{> nope}}", { values: {} }, "t")).toThrow(/無い部品: nope/);
  });

  it("読めない穴の書き方を、黙って残さずに止まる", () => {
    expect(() => render("ok {{ 1x }}", { values: {} }, "t")).toThrow(/読めない穴/);
  });

  it("頭の --- の鍵と本文を分ける", () => {
    expect(splitFrontMatter("---\ntitle: X\n---\n本文\n", "t")).toEqual({
      fields: { title: "X" },
      body: "本文\n",
    });
    expect(splitFrontMatter("本文だけ", "t").body).toBe("本文だけ");
  });
});

describe("役の定義", () => {
  it("役は 3 つ（tpm・devops・engineer）", () => {
    expect(ROLES.sort()).toEqual(["devops", "engineer", "tpm"]);
  });

  it.each(ROLES)("%s は見本の profile で穴が全部埋まり、してはいけないことを持つ", (name) => {
    const role = loadRole(REPO, name, profile);
    expect(role.text).not.toMatch(/\{\{|\}\}/);
    expect(role.text).toContain("## してはいけないこと");
    expect(role.text).toContain(profile.values["tpm.address"]);
    expect(role.permissionMode).toBe(profile.permissionMode);
  });

  it("profile の値が 1 つ欠けると、その名前を言って止まる（反証）", () => {
    const values = { ...profile.values };
    delete values["devops.address"];
    const thin: Profile = { ...profile, values };
    expect(() => loadRole(REPO, "engineer", thin)).toThrow(/devops\.address/);
  });

  it("頭にモデルや effort を書いた役は止める", () => {
    const text = "---\ntitle: X\nmodel: claude-opus-5-5\n---\n本文\n";
    expect(() => parseRole("x", text, profile, "x.md")).toThrow(/書けない鍵 "model"/);
  });

  it("頭の permissionMode が profile 以外なら、その値を使う", () => {
    const role = parseRole(
      "x",
      "---\ntitle: X\npermissionMode: plan\n---\n本文\n",
      profile,
      "x.md",
    );
    expect(role.permissionMode).toBe("plan");
  });

  it("--role は穴を埋めた物を書き、そのパスを渡す", () => {
    const written: string[] = [];
    const prepared = prepareRole(REPO, profile, "devops", undefined, (name, text) => {
      written.push(text);
      return `/state/${name}.md`;
    });
    expect(prepared.path).toBe("/state/devops.md");
    expect(written[0]).toContain("DevOps Engineer");
    expect(written[0]).not.toContain("{{");
  });
});
