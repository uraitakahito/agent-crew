import type { CmuxClient, WorkspaceHandle } from "../src/launchers/cmux/client.js";

/**
 * 偽の cmux。Claude Code の画面の動きを真似る（起動の行・信頼のダイアログ・/model の picker・
 * 貼り付けと送信）。呼ばれ方を calls に記録する。画面の字は Claude Code v2.1.325 の実測に合わせた。
 */
export const DISPLAY: Record<string, string> = {
  "claude-opus-5-5": "Opus 5.5",
  "claude-fable-5-2": "Fable 5.2",
  "claude-sonnet-5-5": "Sonnet 5.5",
  "claude-haiku-5-5": "Haiku 5.5",
};

const PICKER_ROWS = ["Default (recommended)", "Opus 5.5", "Fable 5.2", "Sonnet 5.5", "Haiku 5.5"];
const EFFORTS = ["low", "medium", "high", "xhigh", "max"];
const EFFORT_LABEL: Record<string, string> = {
  low: "○ Low effort",
  medium: "◐ Medium effort (default)",
  high: "● High effort",
  xhigh: "◉ xHigh effort",
  max: "◈ Max effort",
};

export interface FakeOptions {
  /** 起動の行を出さない。 */
  noBanner?: boolean;
  /** 起動の行のモデルを、頼まれた物から替える。 */
  bannerModel?: string;
  bannerEffort?: string;
  trustDialog?: boolean;
  busy?: boolean;
  /** picker で s を押しても決まらない。 */
  pickerIgnoresS?: boolean;
  /** 貼り付けを、初めの n 回だけ失敗にする。 */
  pasteFailures?: number;
  /** 失敗にした貼り付けも、実は届いている。 */
  deliveredOnFailure?: boolean;
  /** send の宛先の、初めのモデルと effort。 */
  initial?: { model: string; effort: string };
}

export type Call = [string, ...unknown[]];

export class FakeCmux implements CmuxClient {
  readonly calls: Call[] = [];
  private phase: "starting" | "trust" | "idle" | "picker" = "idle";
  private model = "Haiku 5.5";
  private effort = "low";
  private cursor = 4;
  private pickerEffort = 0;
  private history: string[] = [];
  private draft = "";
  private pastes = 0;
  private failuresLeft: number;
  private screenReads = 0;
  closed = false;

  constructor(private readonly options: FakeOptions = {}) {
    this.failuresLeft = options.pasteFailures ?? 0;
    if (options.initial !== undefined) {
      this.model = options.initial.model;
      this.effort = options.initial.effort;
    }
  }

  /** 送った依頼（履歴に入った物）。 */
  get submitted(): string[] {
    return this.history.filter((h) => !h.startsWith("⎿") && h !== "/model");
  }

  async createWorkspace(options: {
    name: string;
    cwd: string;
    command: string;
  }): Promise<WorkspaceHandle> {
    this.calls.push(["createWorkspace", options]);
    const model = /--model (\S+)/.exec(options.command)?.[1] ?? "";
    const effort = /--effort (\S+)/.exec(options.command)?.[1] ?? "";
    this.model = this.options.bannerModel ?? DISPLAY[model] ?? model;
    this.effort = this.options.bannerEffort ?? effort;
    this.phase = this.options.trustDialog ? "trust" : "starting";
    return { ref: "workspace:7", id: "00000000-0000-4000-8000-000000000007" };
  }

  async readScreen(workspace: string, lines: number): Promise<string> {
    this.calls.push(["readScreen", workspace, lines]);
    this.screenReads += 1;
    // 起動は 2 回目に見たときに終わる（待ちの回数を試すため）。
    if (this.phase === "starting" && this.screenReads >= 2 && !this.options.noBanner)
      this.phase = "idle";
    return this.render();
  }

  private render(): string {
    if (this.phase === "trust") {
      return [
        " Accessing workspace:",
        "",
        " ~/projects/example",
        "",
        " Quick safety check: Is this a project you created or one you trust? (Like your own code, a",
        "",
        " ❯ No, exit",
        "   Yes, I trust this folder",
        "",
        " Enter to confirm · Esc to cancel",
      ].join("\n");
    }
    if (this.phase === "starting") return " projects/example% claude --model x --effort y\n";
    const out = [
      " ▐▛███▛█   Claude Code v2.1.325",
      `▝▜██████▀  ${this.model} with ${this.effort} effort · Plan`,
      " ▝▝   ▝▝   ~/projects/example",
      "",
    ];
    for (const h of this.history) {
      if (h.startsWith("⎿")) out.push(`  ${h}`);
      else out.push(...h.split("\n").map((l, i) => (i === 0 ? `❯ ${l}` : `  ${l}`)));
    }
    if (this.options.busy) out.push("✻ Working… (esc to interrupt)");
    if (this.phase === "picker") {
      out.push("   Select model", "   Switch between Claude models.", "");
      PICKER_ROWS.forEach((name, i) => {
        const mark = name === this.model ? " ✔" : "";
        out.push(
          `   ${i === this.cursor ? "❯" : " "} ${i + 1}.  ${(name + mark).padEnd(22)} Description`,
        );
      });
      out.push("", `   ${EFFORT_LABEL[EFFORTS[this.pickerEffort] ?? "low"]} ←/→ to adjust`, "");
      out.push("   Enter to set as default · s to use this session only · Esc to cancel");
      return out.join("\n");
    }
    const input = this.draft === "" ? 'Try "write a test"' : this.inputDisplay();
    out.push(
      `                    ○ ${this.effort} · /effort`,
      "─".repeat(60),
      `❯ ${input}`,
      "─".repeat(60),
      "  footer",
    );
    return out.join("\n");
  }

  private inputDisplay(): string {
    if (this.draft === "/model") return "/model";
    return Array.from({ length: this.pastes }, (_, i) => `[Pasted text #${i + 1} +3 lines]`).join(
      "",
    );
  }

  async sendText(workspace: string, text: string): Promise<void> {
    this.calls.push(["sendText", workspace, text]);
    this.draft += text;
  }

  async sendKey(workspace: string, key: string, force: boolean): Promise<void> {
    this.calls.push(["sendKey", workspace, key, force]);
    if (this.phase === "picker") {
      if (!force) throw new Error("waiting on a question or dialog, so nothing was sent");
      if (key === "Up") this.cursor = Math.max(0, this.cursor - 1);
      if (key === "Down") this.cursor = Math.min(PICKER_ROWS.length - 1, this.cursor + 1);
      if (key === "Right") this.pickerEffort = Math.min(EFFORTS.length - 1, this.pickerEffort + 1);
      if (key === "Left") this.pickerEffort = Math.max(0, this.pickerEffort - 1);
      if (key === "Escape") this.phase = "idle";
      if (key === "s" && !this.options.pickerIgnoresS) {
        const effort = EFFORTS[this.pickerEffort] ?? "";
        this.model = PICKER_ROWS[this.cursor] ?? "";
        // 実物と同じく、effort を替えなかったときは「with … effort」を付けない。
        const tail = effort === this.effort ? "" : ` with ${effort} effort`;
        this.effort = effort;
        this.history.push(`⎿  Set model to ${this.model} for this session only${tail}`);
        this.phase = "idle";
      }
      if (key === "s" && this.options.pickerIgnoresS) this.phase = "idle";
      if (key === "Enter") {
        this.history.push(
          `⎿  Set model to ${PICKER_ROWS[this.cursor] ?? ""} and saved as your default for new sessions`,
        );
        this.phase = "idle";
      }
      return;
    }
    if (key === "Enter") {
      if (this.draft === "/model") {
        this.draft = "";
        this.history.push("/model");
        this.phase = "picker";
        this.cursor = Math.max(0, PICKER_ROWS.indexOf(this.model));
        this.pickerEffort = Math.max(0, EFFORTS.indexOf(this.effort));
        return;
      }
      if (this.draft !== "") this.history.push(this.draft);
      this.draft = "";
      this.pastes = 0;
    }
  }

  async paste(workspace: string, text: string, force: boolean): Promise<void> {
    this.calls.push(["paste", workspace, text, force]);
    if (this.draft !== "" && !force)
      throw new Error("an agent prompt holds text, nothing was sent");
    if (this.failuresLeft > 0) {
      this.failuresLeft -= 1;
      if (this.options.deliveredOnFailure) {
        this.draft += text;
        this.pastes += 1;
      }
      throw new Error("Socket closed before reply");
    }
    this.draft += text;
    this.pastes += 1;
  }

  async closeWorkspace(workspace: string): Promise<void> {
    this.calls.push(["closeWorkspace", workspace]);
    this.closed = true;
  }

  async open(url: string, workspace?: string): Promise<string> {
    this.calls.push(["open", url, workspace]);
    return "OK urls=1\n";
  }

  keys(): string[] {
    return this.calls.filter((c) => c[0] === "sendKey").map((c) => String(c[2]));
  }

  pasted(): string[] {
    return this.calls.filter((c) => c[0] === "paste").map((c) => String(c[2]));
  }
}
