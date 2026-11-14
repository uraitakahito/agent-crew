import type { ModelChoice } from "../profile/profile.js";

/**
 * launcher が満たす約束。環境ごと（端末・起こし方の違い）に 1 つ作る。
 * 詳しくは `src/launchers/README.md`。
 */
export interface LaunchSpec {
  /** workspace とセッションの名前。 */
  readonly name: string;
  readonly cwd: string;
  readonly model: ModelChoice;
  readonly effort: string;
  readonly permissionMode: string;
  /** 役の定義のファイル（--append-system-prompt-file に渡す）。 */
  readonly roleFile: string;
  /** 起こした後に渡す依頼の文（決めた人の 1 行を含む）。省けば起こすだけ。 */
  readonly request?: string;
}

export interface Target {
  /** 例 workspace:12 */
  readonly ref: string;
  readonly id: string;
}

export interface SendSpec {
  readonly model: ModelChoice;
  readonly effort: string;
  readonly request?: string;
}

export interface Launcher {
  /** 起こし、モデルと effort を照らし、依頼を渡して、宛先を返す。どれかが確かめられなければ投げる。 */
  launch(spec: LaunchSpec): Promise<Target>;
  /** 動いているセッションのモデルと effort を（このセッションだけ）替え、依頼を渡す。 */
  send(target: string, spec: SendSpec): Promise<void>;
  /** URL を宛先で開く。 */
  open(url: string, target?: string): Promise<void>;
}
