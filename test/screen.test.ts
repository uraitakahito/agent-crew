import { describe, expect, it } from "vitest";
import {
  findBanner,
  findPicker,
  findPromptArea,
  findSessionSwitch,
  isInputEmpty,
  isTrustDialog,
} from "../src/launchers/cmux/screen.js";

// Claude Code v2.1.325 の実測の画面から写した（パスは見本に替えた）。
const STARTED = [
  " ▐▛███▛█   Claude Code v2.1.325",
  "▝▜██████▀  Haiku 5.5 with low effort · Claude Ultra",
  " ▝▝   ▝▝   ~/projects/example · /rc",
  "",
  "                                                                                  ○ low · /effort",
  "───────────────────────────────────────────────────────────────────────────────────────────────────",
  '❯ Try "write a test for <filepath>"',
  "───────────────────────────────────────────────────────────────────────────────────────────────────",
  "    5h --%   --:--    7d --%   --- --:--",
  "  ⏸ manual mode on · ← for agents",
].join("\n");

const PICKER = [
  "   Select model",
  "   Switch between Claude models. Your pick becomes the default for new sessions.",
  "",
  "     1.  Default (recommended)  Sonnet 5.5 · Efficient for routine tasks",
  "     2.  Opus 5.5               For complex work and everyday tasks",
  "     3.  Fable 5.2              For your toughest challenges",
  "     4.  Sonnet 5.5             Most efficient for simpler tasks",
  "   ❯ 5.  Haiku 5.5 ✔            Fastest for quick answers",
  "     ▸   More models             ",
  "",
  "   ◐ Medium effort (default) ←/→ to adjust",
  "",
  "   Enter to set as default · s to use this session only · Esc to cancel",
].join("\n");

describe("画面の読み方", () => {
  it("起動の行からモデルと effort を読む", () => {
    expect(findBanner(STARTED)).toEqual({ model: "Haiku 5.5", effort: "low" });
  });

  it("打ち込まれただけの命令の字は、起動の行と見なさない", () => {
    expect(
      findBanner(" projects/example% claude --model claude-opus-5-5 --effort medium"),
    ).toBeUndefined();
  });

  it("信頼の確認のダイアログを見分ける", () => {
    expect(isTrustDialog(" ❯ No, exit\n   Yes, I trust this folder")).toBe(true);
    expect(isTrustDialog(STARTED)).toBe(false);
  });

  it("picker の行・カーソル・effort を読む", () => {
    const picker = findPicker(PICKER);
    expect(picker?.rows.map((r) => r.name)).toEqual([
      "Default (recommended)",
      "Opus 5.5",
      "Fable 5.2",
      "Sonnet 5.5",
      "Haiku 5.5",
    ]);
    expect(picker?.rows.find((r) => r.cursor)?.number).toBe(5);
    expect(picker?.effort).toBe("medium");
  });

  it("xHigh の表記を xhigh と読む", () => {
    expect(findPicker(PICKER.replace("◐ Medium effort (default)", "◉ xHigh effort"))?.effort).toBe(
      "xhigh",
    );
  });

  it("このセッションだけの決定の行を読み、既定に保存した行は読まない", () => {
    const after = (line: string) => `❯ /model\n  ⎿  ${line}`;
    expect(
      findSessionSwitch(after("Set model to Sonnet 5.5 for this session only with medium effort")),
    ).toEqual({
      model: "Sonnet 5.5",
      effort: "medium",
    });
    expect(findSessionSwitch(after("Set model to Sonnet 5.5 for this session only"))).toEqual({
      model: "Sonnet 5.5",
      effort: undefined,
    });
    expect(
      findSessionSwitch(
        after("Set model to Sonnet 5.5 and saved as your default for new sessions"),
      ),
    ).toBeUndefined();
  });

  it("いちばん後ろの「❯ /model」より上の決定の行は読まない", () => {
    const screen = [
      "❯ /model",
      "  ⎿  Set model to Opus 5.5 for this session only with high effort",
      "❯ /model",
      "",
    ].join("\n");
    expect(findSessionSwitch(screen)).toBeUndefined();
  });

  it("入力の枠を見つけ、例の文を空と見なす", () => {
    const area = findPromptArea(STARTED);
    expect(area).toBeDefined();
    expect(isInputEmpty(area!)).toBe(true);
    expect(area!.history).toContain("Haiku 5.5 with low effort");
  });
});
