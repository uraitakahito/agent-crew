import type { Logger } from "pino";
import { CrewError } from "../../errors.js";
import { byteLength, COMMAND_MAX_BYTES, shellQuote } from "../../shell.js";
import { pollUntil, realSleep, type Sleep } from "../../wait.js";
import type { Launcher, LaunchSpec, SendSpec, Target } from "../types.js";
import { createCmuxClient, type CmuxClient } from "./client.js";
import {
  findBanner,
  findPicker,
  findPromptArea,
  findSessionSwitch,
  isBusy,
  isInputEmpty,
  isTrustDialog,
  type Picker,
} from "./screen.js";

export interface Timing {
  /** 起動の行を待つ回数と間。 */
  readonly startupAttempts: number;
  /** 画面の変化を待つ回数と間（picker・貼り付け・送った後）。 */
  readonly stepAttempts: number;
  readonly intervalMs: number;
}

export const DEFAULT_TIMING: Timing = { startupAttempts: 90, stepAttempts: 30, intervalMs: 1000 };

/** 1 回に貼り付ける量。cmux の paste は 5〜7 KB で「Socket closed before reply」が揺れて出た（実測）。 */
export const PASTE_CHUNK_BYTES = 2000;
const PASTE_RETRIES = 3;
const SCREEN_LINES = 400;
const TAIL_LINES = 25;

/** 効き方は必ず「どの effort の段か」の順で見る（picker の ←/→ はこの順に動く）。 */
const EFFORT_ORDER = ["low", "medium", "high", "xhigh", "max"];

export interface CmuxLauncherDeps {
  readonly cmux?: CmuxClient;
  readonly sleep?: Sleep;
  readonly timing?: Timing;
  readonly log: Logger;
}

export function tail(screen: string, lines = TAIL_LINES): string {
  return screen.replace(/\s+$/, "").split("\n").slice(-lines).join("\n");
}

/** 端末に打ち込む命令。依頼の文は入れない（長さの境と引用符の崩れを避けるため）。 */
export function buildCommand(spec: LaunchSpec): string {
  return [
    "claude",
    "--model",
    spec.model.id,
    "--effort",
    spec.effort,
    "--permission-mode",
    spec.permissionMode,
    "--append-system-prompt-file",
    shellQuote(spec.roleFile),
    "--name",
    shellQuote(spec.name),
  ].join(" ");
}

/** 依頼の文を、行の境で size バイト以下に分ける（1 行が長すぎれば、その行を字で切る）。 */
export function splitForPaste(text: string, size = PASTE_CHUNK_BYTES): string[] {
  const chunks: string[] = [];
  let current = "";
  const push = () => {
    if (current !== "") chunks.push(current);
    current = "";
  };
  for (const line of text.split(/(?<=\n)/)) {
    if (byteLength(current + line) <= size) {
      current += line;
      continue;
    }
    push();
    if (byteLength(line) <= size) {
      current = line;
      continue;
    }
    for (const ch of line) {
      if (byteLength(current + ch) > size) push();
      current += ch;
    }
  }
  push();
  return chunks;
}

/** 依頼の最後の行（送った後に、会話の履歴に出たかを照らす目印）。 */
export function lastLineMark(text: string): string {
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l !== "");
  return (lines.at(-1) ?? "").slice(0, 40);
}

export class CmuxLauncher implements Launcher {
  private readonly cmux: CmuxClient;
  private readonly sleep: Sleep;
  private readonly timing: Timing;
  private readonly log: Logger;

  constructor(deps: CmuxLauncherDeps) {
    this.cmux = deps.cmux ?? createCmuxClient();
    this.sleep = deps.sleep ?? realSleep;
    this.timing = deps.timing ?? DEFAULT_TIMING;
    this.log = deps.log;
  }

  private screen(target: string): Promise<string> {
    return this.cmux.readScreen(target, SCREEN_LINES);
  }

  private poll<T>(check: (screen: string) => T | undefined, target: string, attempts: number) {
    return pollUntil(async () => check(await this.screen(target)), {
      attempts,
      intervalMs: this.timing.intervalMs,
      sleep: this.sleep,
    });
  }

  async launch(spec: LaunchSpec): Promise<Target> {
    const command = buildCommand(spec);
    if (byteLength(command) > COMMAND_MAX_BYTES) {
      throw new CrewError(
        `起こす命令が ${byteLength(command)} バイトで、${COMMAND_MAX_BYTES} バイトを超える（cmux は黙って実行しない）。役のファイルのパスか名前を短くしてください`,
      );
    }
    const target = await this.cmux.createWorkspace({ name: spec.name, cwd: spec.cwd, command });
    this.log.info({ workspace: target.ref }, "workspace を作った。起動の行を待つ");

    try {
      const seen = await this.poll(
        (screen) => {
          if (isTrustDialog(screen)) return { kind: "trust" as const, screen };
          const banner = findBanner(screen);
          return banner === undefined ? undefined : { kind: "banner" as const, banner, screen };
        },
        target.ref,
        this.timing.startupAttempts,
      );
      if (seen === undefined) {
        throw new CrewError(
          "起動の行（例「Opus 5.5 with high effort」）が出なかった。起動は確かめられなかった",
          tail(await this.screen(target.ref)),
        );
      }
      if (seen.kind === "trust") {
        throw new CrewError(
          `作業フォルダ ${spec.cwd} を Claude Code が信頼していない（確認のダイアログの既定は「No, exit」）。一度手で開いて信頼するか、profile の cwd を信頼済みのフォルダにしてください`,
          tail(seen.screen),
        );
      }
      const { banner } = seen;
      if (banner.model !== spec.model.display || banner.effort !== spec.effort) {
        throw new CrewError(
          `起動の行が頼んだ物と違う: 頼んだのは ${spec.model.display}・${spec.effort}、画面は ${banner.model}・${banner.effort}`,
          tail(seen.screen),
        );
      }
      this.log.info({ workspace: target.ref, ...banner }, "起動の行を照らした");
      if (spec.request !== undefined) await this.deliver(target.ref, spec.request);
      return target;
    } catch (error) {
      // 作ったのはこちらなので片付ける（信頼のダイアログの既定は No なので、閉じても何も起きない）。
      await this.cmux.closeWorkspace(target.ref).catch((closeError: unknown) => {
        this.log.warn(
          { workspace: target.ref, err: closeError },
          "失敗した workspace を閉じられなかった",
        );
      });
      throw error;
    }
  }

  async send(target: string, spec: SendSpec): Promise<void> {
    const screen = await this.screen(target);
    if (isBusy(screen)) {
      throw new CrewError(
        `${target} は返答を作っている途中。終わってから送ってください`,
        tail(screen),
      );
    }
    await this.switchModel(target, spec);
    if (spec.request !== undefined) await this.deliver(target, spec.request);
  }

  async open(url: string, target?: string): Promise<void> {
    const out = await this.cmux.open(url, target);
    if (!/OK urls=1\b/.test(out)) {
      throw new CrewError(
        `${url} を ${target ?? "呼んだ側の workspace"} で開けたか確かめられない: ${out.trim()}`,
      );
    }
  }

  /**
   * /model の picker で、モデルの行と effort を合わせて s（このセッションだけ）で決める。
   * `/model <名前>` と `/effort <段>` は、利用者の settings.json の既定まで書き換えるので使わない。
   */
  private async switchModel(target: string, spec: SendSpec): Promise<void> {
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      await this.cmux.sendText(target, "/model");
      // 字が入力の枠に出てから Enter を押す（早すぎると picker が開かないことがあった）。
      const typed = await this.poll(
        (screen) => (findPromptArea(screen)?.input === "/model" ? true : undefined),
        target,
        this.timing.stepAttempts,
      );
      if (typed === undefined) {
        throw new CrewError("入力の枠に /model が出ない", tail(await this.screen(target)));
      }
      await this.cmux.sendKey(target, "Enter", false);
      let picker = await this.poll(findPicker, target, this.timing.stepAttempts);
      if (picker === undefined) {
        throw new CrewError("/model の picker が出なかった", tail(await this.screen(target)));
      }
      const wanted = picker.rows.find((row) => row.name === spec.model.display);
      if (wanted === undefined) {
        await this.cmux.sendKey(target, "Escape", true);
        const names = picker.rows.map((r) => r.name).join("・");
        throw new CrewError(
          `picker に ${spec.model.display} の行が無い（在るのは ${names}）。このモデルは crew launch で起こし直してください`,
        );
      }
      const startEffort = picker.effort;
      picker = await this.moveCursor(target, picker, wanted.number);
      await this.moveEffort(target, picker, spec.effort);
      await this.cmux.sendKey(target, "s", true);
      const switched = await this.poll(
        (screen) => {
          const s = findSessionSwitch(screen);
          if (s?.model !== spec.model.display) return undefined;
          // effort を替えなかった回は決定の行に出ないので、picker を開いた時の段で照らす。
          const effort = s.effort ?? startEffort;
          return effort === spec.effort ? { model: s.model, effort } : undefined;
        },
        target,
        this.timing.stepAttempts,
      );
      if (switched !== undefined) {
        this.log.info(
          { workspace: target, ...switched },
          "モデルと effort を替えた（このセッションだけ）",
        );
        return;
      }
      this.log.warn({ workspace: target, attempt }, "picker の決定の行が出ない。打ち直す");
      if (findPicker(await this.screen(target)) !== undefined) {
        await this.cmux.sendKey(target, "Escape", true);
      }
    }
    throw new CrewError(
      `モデルと effort を ${spec.model.display}・${spec.effort} に替えられたか確かめられなかった`,
      tail(await this.screen(target)),
    );
  }

  private async moveCursor(target: string, picker: Picker, number: number): Promise<Picker> {
    let current = picker;
    for (let step = 0; step < 20; step += 1) {
      const cursor = current.rows.find((r) => r.cursor);
      if (cursor === undefined) throw new CrewError("picker のカーソルの行が読めない");
      if (cursor.number === number) return current;
      await this.cmux.sendKey(target, cursor.number < number ? "Down" : "Up", true);
      const before = cursor.number;
      const next = await this.poll(
        (screen) => {
          const p = findPicker(screen);
          const c = p?.rows.find((r) => r.cursor);
          return c !== undefined && c.number !== before ? p : undefined;
        },
        target,
        this.timing.stepAttempts,
      );
      if (next === undefined)
        throw new CrewError("picker のカーソルが動かない", tail(await this.screen(target)));
      current = next;
    }
    throw new CrewError("picker のカーソルを目当ての行に合わせられない");
  }

  private async moveEffort(target: string, picker: Picker, effort: string): Promise<void> {
    const goal = EFFORT_ORDER.indexOf(effort);
    if (goal < 0)
      throw new CrewError(`effort "${effort}" は picker で選べない（${EFFORT_ORDER.join("・")}）`);
    let current = picker.effort;
    for (let step = 0; step < EFFORT_ORDER.length * 2; step += 1) {
      if (current === undefined) {
        throw new CrewError(
          "picker の effort が読めない（このモデルは effort を持たないのかもしれない）",
        );
      }
      const at = EFFORT_ORDER.indexOf(current);
      if (at === goal) return;
      await this.cmux.sendKey(target, at < goal ? "Right" : "Left", true);
      const before = current;
      current = await this.poll(
        (screen) => {
          const e = findPicker(screen)?.effort;
          return e !== undefined && e !== before ? e : undefined;
        },
        target,
        this.timing.stepAttempts,
      );
      if (current === undefined)
        throw new CrewError("picker の effort が動かない", tail(await this.screen(target)));
    }
    throw new CrewError(`picker の effort を ${effort} に合わせられない`);
  }

  /** 依頼の文を分けて貼り付け、送って、会話の履歴に最後の行が出たかを照らす。 */
  private async deliver(target: string, request: string): Promise<void> {
    const ready = await this.poll(
      (screen) => {
        const area = findPromptArea(screen);
        return area !== undefined && isInputEmpty(area) && !isBusy(screen) ? area : undefined;
      },
      target,
      this.timing.stepAttempts,
    );
    if (ready === undefined) {
      throw new CrewError(
        "入力の枠が空にならない（誰かが打っている途中か、問いが開いている）",
        tail(await this.screen(target)),
      );
    }
    const chunks = splitForPaste(request);
    for (const [index, chunk] of chunks.entries()) {
      await this.pasteWithRetry(target, chunk, index > 0);
    }
    await this.cmux.sendKey(target, "Enter", false);
    const mark = lastLineMark(request);
    const sent = await this.poll(
      (screen) => {
        const area = findPromptArea(screen);
        if (area === undefined) return undefined;
        return area.history.includes(mark) && !area.input.includes("[Pasted text #")
          ? true
          : undefined;
      },
      target,
      this.timing.stepAttempts,
    );
    if (sent === undefined) {
      throw new CrewError(
        `依頼を送れたか確かめられなかった（最後の行「${mark}」が会話に出ない）`,
        tail(await this.screen(target)),
      );
    }
    this.log.info(
      { workspace: target, chunks: chunks.length, bytes: byteLength(request) },
      "依頼を送った",
    );
  }

  private async inputOf(target: string): Promise<string | undefined> {
    return findPromptArea(await this.screen(target))?.input;
  }

  /**
   * 貼り付けが失敗と返っても、届いていることがある。やり直す前に入力の枠が変わったかを見て、
   * 変わっていれば届いたと見なす（同じ塊を 2 度送らない）。
   */
  private async pasteWithRetry(target: string, chunk: string, force: boolean): Promise<void> {
    const before = await this.inputOf(target);
    for (let attempt = 1; attempt <= PASTE_RETRIES; attempt += 1) {
      try {
        await this.cmux.paste(target, chunk, force);
        return;
      } catch (error) {
        await this.sleep(this.timing.intervalMs);
        const after = await this.inputOf(target);
        if (after !== undefined && after !== before) {
          this.log.warn(
            { workspace: target, attempt },
            "貼り付けは失敗と返ったが、入力の枠は変わった。届いたと見なす",
          );
          return;
        }
        this.log.warn({ workspace: target, attempt, err: error }, "貼り付けが失敗した。やり直す");
      }
    }
    throw new CrewError(`依頼の貼り付けが ${PASTE_RETRIES} 回とも失敗した`);
  }
}
