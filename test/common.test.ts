import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { checkBuild } from "../src/build-info.js";
import { requireDecision } from "../src/commands/common.js";
import { decisionLine, withDecisionLine } from "../src/decision.js";
import { loadProfile, parseProfile, resolveChoice } from "../src/profile/profile.js";

const EXAMPLE = join(import.meta.dirname, "..", "profiles", "example");

describe("モデルと effort と決めた人", () => {
  it("どれかが無ければ、足りない旗の名前を言って止まる", () => {
    expect(() => requireDecision({ model: "claude-opus-5-5" })).toThrow(/--effort・--decided-by/);
    expect(() => requireDecision({})).toThrow(/--model・--effort・--decided-by/);
  });

  it("決めた人は pm か tpm だけ", () => {
    expect(() => requireDecision({ model: "m", effort: "e", decidedBy: "me" })).toThrow(
      /pm か tpm/,
    );
    expect(requireDecision({ model: "m", effort: "e", decidedBy: "pm" }).decidedBy).toBe("pm");
  });

  it("依頼の文の頭に、モデル・effort・決めた人の 1 行を入れる", () => {
    const decision = { model: "claude-opus-5-5", effort: "high", decidedBy: "tpm" } as const;
    expect(decisionLine(decision)).toBe(
      "- モデル: claude-opus-5-5 ／ effort: high ／ 決めた人: TPM 役",
    );
    expect(withDecisionLine(decision, "\n\n本文")).toBe(`${decisionLine(decision)}\n\n本文`);
  });
});

describe("profile", () => {
  it("見本の profile を読める", () => {
    const profile = loadProfile(EXAMPLE, "/srv/fake-home");
    expect(profile.cwd).toBe("/srv/fake-home/projects/example");
    expect(profile.models.map((m) => m.id)).toContain("claude-opus-5-5");
  });

  it("鍵が欠けていれば、その名前を言って止まる", () => {
    const text = JSON.stringify({
      launcher: "cmux",
      cwd: "~",
      permissionMode: "default",
      efforts: ["low"],
    });
    expect(() => parseProfile(text, "/x")).toThrow(/"models"/);
  });

  it("profile に無いモデルと effort は、起こす前に止める", () => {
    const profile = loadProfile(EXAMPLE);
    expect(() => resolveChoice(profile, "claude-unknown", "high")).toThrow(/知らないモデル/);
    expect(() => resolveChoice(profile, "claude-opus-5-5", "turbo")).toThrow(/知らない effort/);
    expect(resolveChoice(profile, "claude-opus-5-5", "high").display).toBe("Opus 5.5");
  });

  it("profile を渡さなければ止まる", () => {
    const saved = process.env["CREW_PROFILE"];
    delete process.env["CREW_PROFILE"];
    try {
      expect(() => loadProfile(undefined)).toThrow(/profile を渡してください/);
    } finally {
      if (saved !== undefined) process.env["CREW_PROFILE"] = saved;
    }
  });
});

describe("古い dist で動かさない", () => {
  function dist(commit?: string) {
    const root = mkdtempSync(join(tmpdir(), "crew-build-"));
    const distDir = join(root, "dist");
    mkdirSync(distDir);
    if (commit !== undefined)
      writeFileSync(join(distDir, "build-info.json"), JSON.stringify({ commit }));
    return { distDir, repoDir: root };
  }

  it("建てた commit と今の commit が同じなら通す", () => {
    expect(() => checkBuild(dist("a".repeat(40)), () => "a".repeat(40))).not.toThrow();
  });

  it("違えば build を打つよう言って止まる", () => {
    expect(() => checkBuild(dist("a".repeat(40)), () => "b".repeat(40))).toThrow(/pnpm run build/);
  });

  it("build-info が無ければ止まる", () => {
    expect(() => checkBuild(dist(), () => "b".repeat(40))).toThrow(/build-info.json が無い/);
  });

  it("git の checkout でなければ比べない", () => {
    expect(() => checkBuild(dist(), () => undefined)).not.toThrow();
  });
});

describe("決めた理由", () => {
  it("--reason を渡せば、決めた人の後ろに括弧で入れる", () => {
    const decision = requireDecision({
      model: "claude-opus-5-5",
      effort: "high",
      decidedBy: "tpm",
      reason: "段が多いため",
    });
    expect(decisionLine(decision)).toBe(
      "- モデル: claude-opus-5-5 ／ effort: high ／ 決めた人: TPM 役（段が多いため）",
    );
  });
});
