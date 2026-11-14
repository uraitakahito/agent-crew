import { spawn } from "node:child_process";
import { CrewError } from "../../errors.js";

/**
 * cmux を呼ぶ所は、この 1 つの関数に集める。試験では偽の物に差し替える。
 * 終了コードが 0 でなければ投げる（標準エラーを message に入れる）。
 */
export type RunCmux = (args: readonly string[], input?: string) => Promise<string>;

export const runCmux: RunCmux = (args, input) =>
  new Promise((resolve, reject) => {
    const child = spawn("cmux", args, {
      // 古い命令の名前への注意書きを止める（標準エラーを汚さないため）。
      env: { ...process.env, CMUX_QUIET: "1" },
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8").on("data", (chunk: string) => (stdout += chunk));
    child.stderr.setEncoding("utf8").on("data", (chunk: string) => (stderr += chunk));
    child.on("error", (error) => {
      reject(new CrewError(`cmux を起こせない: ${error.message}`));
    });
    child.on("close", (code) => {
      if (code === 0) resolve(stdout);
      else reject(new Error(`cmux ${args[0] ?? ""} が失敗した（${code}）: ${stderr.trim()}`));
    });
    child.stdin.end(input ?? "");
  });

export interface WorkspaceHandle {
  /** 例 workspace:12 */
  readonly ref: string;
  readonly id: string;
}

export interface CmuxClient {
  createWorkspace(options: {
    name: string;
    cwd: string;
    command: string;
  }): Promise<WorkspaceHandle>;
  /** 画面の末尾（scrollback を含む）を lines 行まで。 */
  readScreen(workspace: string, lines: number): Promise<string>;
  sendText(workspace: string, text: string): Promise<void>;
  /** force: 問いや dialog が開いていても送る（picker の中で使う）。 */
  sendKey(workspace: string, key: string, force: boolean): Promise<void>;
  /** 端末の貼り付け（Cmd+V と同じ道）。force: 下書きが在っても送る。 */
  paste(workspace: string, text: string, force: boolean): Promise<void>;
  closeWorkspace(workspace: string): Promise<void>;
  /** URL を開く。workspace を省くと、呼んだ側の workspace で開く。返すのは cmux の出力。 */
  open(url: string, workspace?: string): Promise<string>;
}

function parseJson(text: string, what: string): Record<string, unknown> {
  try {
    const value: unknown = JSON.parse(text);
    if (typeof value === "object" && value !== null) return value as Record<string, unknown>;
  } catch {
    // 下で投げる
  }
  throw new Error(`cmux の ${what} の出力が JSON でない: ${text.slice(0, 200)}`);
}

export function createCmuxClient(run: RunCmux = runCmux): CmuxClient {
  return {
    async createWorkspace({ name, cwd, command }) {
      const out = await run([
        "--json",
        "--id-format",
        "both",
        "workspace",
        "create",
        "--name",
        name,
        "--cwd",
        cwd,
        "--command",
        command,
      ]);
      const json = parseJson(out, "workspace create");
      const ref = json["workspace_ref"];
      const id = json["workspace_id"];
      if (typeof ref !== "string" || typeof id !== "string") {
        throw new Error(
          `cmux の workspace create の出力に workspace_ref・workspace_id が無い: ${out}`,
        );
      }
      return { ref, id };
    },
    async readScreen(workspace, lines) {
      return run([
        "read-screen",
        "--workspace",
        workspace,
        "--scrollback",
        "--lines",
        String(lines),
      ]);
    },
    async sendText(workspace, text) {
      await run(["send", "--workspace", workspace, "--", text]);
    },
    async sendKey(workspace, key, force) {
      await run(["send-key", ...(force ? ["--force"] : []), "--workspace", workspace, key]);
    },
    async paste(workspace, text, force) {
      await run(["paste", ...(force ? ["--force"] : []), "--workspace", workspace, "-"], text);
    },
    async closeWorkspace(workspace) {
      // Claude Code が動いている workspace は --force でないと閉じない。
      await run(["workspace", "close", workspace, "--force"]);
    },
    async open(url, workspace) {
      return run(["open", url, ...(workspace === undefined ? [] : ["--workspace", workspace])]);
    },
  };
}
