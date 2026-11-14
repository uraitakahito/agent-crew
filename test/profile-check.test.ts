import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { checkProfile, formatCheck, initProfile, scanRequirements } from "../src/profile/check.js";
import { loadProfile, type Profile } from "../src/profile/profile.js";

const REPO = join(import.meta.dirname, "..");
const profile = loadProfile(join(REPO, "profiles", "example"));

describe("profile に要る物", () => {
  it("見本の profile は、欠けも使わない値も無い", () => {
    const result = checkProfile(REPO, profile);
    expect(result).toEqual({
      missingValues: [],
      missingPartials: [],
      unusedValues: [],
      renderErrors: [],
    });
    expect(formatCheck(result, "p").ok).toBe(true);
  });

  it("値を 1 つ消すと、その鍵と使う所を挙げる（反証）", () => {
    const values = { ...profile.values };
    delete values["openOk"];
    const result = checkProfile(REPO, { ...profile, values });
    expect(result.missingValues).toEqual([
      { key: "openOk", usedIn: ["templates/partials/open-both.md"] },
    ]);
    expect(formatCheck(result, "p").text).toMatch(/"openOk" が無い/);
  });

  it("repo に無い部品が profile にも無ければ挙げる", () => {
    const elsewhere: Profile = { ...profile, dir: mkdtempSync(join(tmpdir(), "crew-profile-")) };
    const names = checkProfile(REPO, elsewhere).missingPartials.map((p) => p.name);
    expect(names).toEqual(["project-rules"]);
  });

  it("使っていない値を挙げる（直さなくても通る）", () => {
    const result = checkProfile(REPO, { ...profile, values: { ...profile.values, old: "x" } });
    expect(result.unusedValues).toEqual(["old"]);
    expect(formatCheck(result, "p").ok).toBe(true);
  });

  it("雛形が --var で受ける名前は、profile に要る物に入れない", () => {
    const keys = [...scanRequirements(REPO).values.keys()];
    expect(keys).not.toContain("ticket");
    expect(keys).not.toContain("topic");
  });
});

describe("docs の鍵の一覧", () => {
  const docs = readFileSync(join(REPO, "docs", "profile.md"), "utf8");
  const section = docs.slice(docs.indexOf("## values の鍵"), docs.indexOf("## 部品"));
  const documented = [...section.matchAll(/^\|\s*`([^`]+)`\s*\|/gm)].map((m) => m[1]);

  it("穴から割り出した values の鍵と、docs の表の鍵が同じ", () => {
    const required = [...scanRequirements(REPO).values.keys()].sort();
    expect([...documented].sort()).toEqual(required);
  });

  it("見本の profile の values の鍵も同じ", () => {
    expect(Object.keys(profile.values).sort()).toEqual([...documented].sort());
  });
});

describe("crew profile init", () => {
  it("見本を写し、在れば上書きしない", () => {
    const root = mkdtempSync(join(tmpdir(), "crew-init-"));
    const dest = initProfile(REPO, "office", root);
    expect(existsSync(join(dest, "profile.json"))).toBe(true);
    expect(existsSync(join(dest, "partials", "project-rules.md"))).toBe(true);
    expect(() => initProfile(REPO, "office", root)).toThrow(/上書きしない/);
  });
});
