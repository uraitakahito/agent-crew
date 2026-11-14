import { describe, expect, it } from "vitest";
import { CrewError } from "../src/errors.js";
import {
  buildCommand,
  CmuxLauncher,
  lastLineMark,
  PASTE_CHUNK_BYTES,
  splitForPaste,
  type Timing,
} from "../src/launchers/cmux/launcher.js";
import type { LaunchSpec } from "../src/launchers/types.js";
import { silentLogger } from "../src/log.js";
import { byteLength, COMMAND_MAX_BYTES } from "../src/shell.js";
import { FakeCmux, type FakeOptions } from "./fake-cmux.js";

const TIMING: Timing = { startupAttempts: 5, stepAttempts: 5, intervalMs: 1 };
const noSleep = () => Promise.resolve();

const OPUS = { id: "claude-opus-5-5", display: "Opus 5.5" };
const HAIKU = { id: "claude-haiku-5-5", display: "Haiku 5.5" };

/** 引用符・$・` を含む 5 KB を超える依頼。 */
const LONG_REQUEST = [
  "- モデル: claude-haiku-5-5 ／ effort: low ／ 決めた人: TPM 役",
  ...Array.from(
    { length: 70 },
    (_, i) => `行 ${i}: "二重" と 'single' と $HOME と \`tick\` と $(echo x) と \\ の行。`,
  ),
  "合言葉: tsubame-7319",
].join("\n");

function setup(options: FakeOptions = {}) {
  const cmux = new FakeCmux(options);
  const launcher = new CmuxLauncher({ cmux, sleep: noSleep, timing: TIMING, log: silentLogger });
  return { cmux, launcher };
}

function spec(overrides: Partial<LaunchSpec> = {}): LaunchSpec {
  return {
    name: "crew engineer",
    cwd: "~/projects/example",
    model: HAIKU,
    effort: "low",
    permissionMode: "default",
    roleFile: "/tmp/roles/engineer.md",
    ...overrides,
  };
}

describe("crew launch（cmux）", () => {
  it("起動の行を照らし、依頼を分けて貼って送り、宛先を返す", async () => {
    const { cmux, launcher } = setup();
    expect(byteLength(LONG_REQUEST)).toBeGreaterThan(5000);
    const target = await launcher.launch(spec({ request: LONG_REQUEST }));

    expect(target.ref).toBe("workspace:7");
    const pastes = cmux.pasted();
    expect(pastes.length).toBeGreaterThanOrEqual(3);
    expect(pastes.every((p) => byteLength(p) <= PASTE_CHUNK_BYTES)).toBe(true);
    expect(pastes.join("")).toBe(LONG_REQUEST);
    expect(cmux.submitted).toEqual([LONG_REQUEST]);
    expect(cmux.closed).toBe(false);
  });

  it("打ち込む命令は短い固定の形で、依頼の文を含まない", async () => {
    const { cmux, launcher } = setup();
    await launcher.launch(spec({ request: LONG_REQUEST }));
    const created = cmux.calls.find((c) => c[0] === "createWorkspace")?.[1] as { command: string };
    expect(byteLength(created.command)).toBeLessThanOrEqual(COMMAND_MAX_BYTES);
    expect(created.command).not.toContain("tsubame");
    expect(created.command).toContain("--append-system-prompt-file /tmp/roles/engineer.md");
  });

  it("起動の行が出なければ失敗で終わり、作った workspace を閉じる", async () => {
    const { cmux, launcher } = setup({ noBanner: true });
    await expect(launcher.launch(spec({ request: "頼み" }))).rejects.toThrow(
      /起動の行.*出なかった/,
    );
    expect(cmux.pasted()).toEqual([]);
    expect(cmux.closed).toBe(true);
  });

  it("起動の行のモデルが頼んだ物と違えば失敗で終わる", async () => {
    const { cmux, launcher } = setup({ bannerModel: "Sonnet 5.5" });
    await expect(launcher.launch(spec({ request: "頼み" }))).rejects.toThrow(/頼んだ物と違う/);
    expect(cmux.pasted()).toEqual([]);
  });

  it("起動の行の effort が頼んだ物と違えば失敗で終わる", async () => {
    const { launcher } = setup({ bannerEffort: "high" });
    await expect(launcher.launch(spec())).rejects.toThrow(/頼んだ物と違う/);
  });

  it("信頼の確認のダイアログが出たら、キーを 1 つも送らずに失敗で終わる", async () => {
    const { cmux, launcher } = setup({ trustDialog: true });
    await expect(launcher.launch(spec({ request: "頼み" }))).rejects.toThrow(/信頼していない/);
    expect(cmux.keys()).toEqual([]);
    expect(cmux.pasted()).toEqual([]);
    expect(cmux.closed).toBe(true);
  });

  it("命令が上限のバイト数を超えるなら、workspace を作らずに止まる", async () => {
    const { cmux, launcher } = setup();
    const roleFile = `/tmp/${"長".repeat(400)}.md`;
    await expect(launcher.launch(spec({ roleFile }))).rejects.toBeInstanceOf(CrewError);
    expect(cmux.calls.some((c) => c[0] === "createWorkspace")).toBe(false);
  });

  it("貼り付けが失敗と返っても届いていれば、同じ塊を 2 度は送らない", async () => {
    const { cmux, launcher } = setup({ pasteFailures: 1, deliveredOnFailure: true });
    await launcher.launch(spec({ request: LONG_REQUEST }));
    expect(cmux.submitted).toEqual([LONG_REQUEST]);
  });

  it("貼り付けが届かずに失敗したら、やり直して届ける", async () => {
    const { cmux, launcher } = setup({ pasteFailures: 2 });
    await launcher.launch(spec({ request: LONG_REQUEST }));
    expect(cmux.submitted).toEqual([LONG_REQUEST]);
  });
});

describe("crew send（cmux）", () => {
  it("picker で行と effort を合わせ、s（このセッションだけ）で決める", async () => {
    const { cmux, launcher } = setup({ initial: { model: "Haiku 5.5", effort: "low" } });
    await launcher.send("workspace:7", { model: OPUS, effort: "high", request: "続けて計画を" });

    // 既定まで書き換える `/model <名前>` と、picker の Enter は使わない。
    const texts = cmux.calls.filter((c) => c[0] === "sendText").map((c) => c[2]);
    expect(texts).toEqual(["/model"]);
    const keys = cmux.keys();
    expect(keys).toEqual(["Enter", "Up", "Up", "Up", "Right", "Right", "s", "Enter"]);
    expect(cmux.submitted).toEqual(["続けて計画を"]);
  });

  it("返答を作っている途中なら、何も送らずに止まる", async () => {
    const { cmux, launcher } = setup({ busy: true });
    await expect(launcher.send("workspace:7", { model: OPUS, effort: "high" })).rejects.toThrow(
      /途中/,
    );
    expect(cmux.keys()).toEqual([]);
  });

  it("picker に行の無いモデルなら、picker を閉じて止まる", async () => {
    const { cmux, launcher } = setup();
    const model = { id: "claude-old-1", display: "Old 1" };
    await expect(launcher.send("workspace:7", { model, effort: "low" })).rejects.toThrow(
      /行が無い/,
    );
    expect(cmux.keys().at(-1)).toBe("Escape");
  });

  it("決定の行が出なければ打ち直し、2 回とも出なければ失敗で終わる", async () => {
    const { cmux, launcher } = setup({ pickerIgnoresS: true });
    await expect(launcher.send("workspace:7", { model: OPUS, effort: "high" })).rejects.toThrow(
      /確かめられなかった/,
    );
    expect(cmux.keys().filter((k) => k === "s")).toHaveLength(2);
  });
});

describe("貼り付けの分け方", () => {
  it("行の境で上限以下に分け、つなぐと元に戻る", () => {
    const chunks = splitForPaste(LONG_REQUEST, 1000);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((c) => byteLength(c) <= 1000)).toBe(true);
    expect(chunks.join("")).toBe(LONG_REQUEST);
  });

  it("上限より長い 1 行は字で切り、多バイトの字を割らない", () => {
    const line = "あ".repeat(1000);
    const chunks = splitForPaste(line, 100);
    expect(chunks.every((c) => byteLength(c) <= 100)).toBe(true);
    expect(chunks.join("")).toBe(line);
  });

  it("送った後の目印は、最後の空でない行の頭", () => {
    expect(lastLineMark("一\n二\n\n  三の行  \n\n")).toBe("三の行");
  });
});

describe("打ち込む命令", () => {
  it("空白を含むパスと名前を引用符で包む", () => {
    const command = buildCommand(spec({ roleFile: "/tmp/a b/role.md", name: "crew 実装" }));
    expect(command).toBe(
      "claude --model claude-haiku-5-5 --effort low --permission-mode default --append-system-prompt-file '/tmp/a b/role.md' --name 'crew 実装'",
    );
  });
});

describe("crew send の決定の行", () => {
  it("effort を替えない回（決定の行に effort が出ない）も、開いた時の段で照らして通す", async () => {
    const { cmux, launcher } = setup({ initial: { model: "Haiku 5.5", effort: "low" } });
    await launcher.send("workspace:7", {
      model: { id: "claude-sonnet-5-5", display: "Sonnet 5.5" },
      effort: "low",
    });
    expect(cmux.keys()).toEqual(["Enter", "Up", "s"]);
  });

  it("前の回の決定の行を、今回の決定と読み違えない", async () => {
    const { cmux, launcher } = setup({ initial: { model: "Haiku 5.5", effort: "low" } });
    await launcher.send("workspace:7", { model: OPUS, effort: "high" });
    // 2 回目は s が効かない。画面には 1 回目の「Opus 5.5・high」の決定の行が残っている。
    const ignoring = new FakeCmux({
      initial: { model: "Opus 5.5", effort: "high" },
      pickerIgnoresS: true,
    });
    Object.assign(ignoring, {
      history: (cmux as unknown as { history: string[] }).history.slice(),
    });
    const again = new CmuxLauncher({
      cmux: ignoring,
      sleep: noSleep,
      timing: TIMING,
      log: silentLogger,
    });
    await expect(again.send("workspace:7", { model: OPUS, effort: "high" })).rejects.toThrow(
      /確かめられなかった/,
    );
  });
});

describe("URL を開く", () => {
  it("宛先と呼んだ側の両方で開き、OK urls=1 を確かめる", async () => {
    const { cmux, launcher } = setup();
    await launcher.open("https://example.com/a", "00000000-0000-4000-8000-000000000007");
    await launcher.open("https://example.com/a");
    expect(cmux.calls.filter((c) => c[0] === "open")).toEqual([
      ["open", "https://example.com/a", "00000000-0000-4000-8000-000000000007"],
      ["open", "https://example.com/a", undefined],
    ]);
  });
});
