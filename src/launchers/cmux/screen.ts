/**
 * cmux の画面に出る Claude Code の字を読む所。字の形はここに集め、試験の画面の見本と一緒に持つ。
 * 合わなくなったら「確かめられなかった」と失敗で知らせる（黙って成功にしない）。
 *
 * 見本（Claude Code v2.1.325 で実測）:
 *   起動の行   ▝▜██████▀  Haiku 5.5 with low effort · <契約の名前>
 *   effort の印                                   ○ low · /effort
 *   picker     ❯ 5.  Haiku 5.5 ✔            Fastest for quick answers
 *              ○ Low effort ←/→ to adjust      （medium は "Medium effort (default)"）
 *   picker の決定  ⎿  Set model to Sonnet 5.5 for this session only with medium effort
 *                 （effort を替えなかったときは「with … effort」が付かない）
 */

export interface Banner {
  readonly model: string;
  readonly effort: string;
}

const BANNER = /\b([A-Z][A-Za-z]+ \d+(?:\.\d+)?) with ([A-Za-z]+) effort\b/g;

/** 起動の行（/model の後は書き換わる）。いちばん後ろの物を返す。 */
export function findBanner(screen: string): Banner | undefined {
  let last: Banner | undefined;
  for (const m of screen.matchAll(BANNER)) {
    last = { model: m[1] ?? "", effort: (m[2] ?? "").toLowerCase() };
  }
  return last;
}

/** 信頼していないフォルダで出る確認のダイアログ。既定の選びは「No, exit」。 */
export function isTrustDialog(screen: string): boolean {
  return /Yes, I trust this folder|Is this a project you created or one you trust/.test(screen);
}

/** 返答を作っている途中か。 */
export function isBusy(screen: string): boolean {
  return /esc to interrupt/i.test(screen);
}

export interface PickerRow {
  readonly number: number;
  readonly name: string;
  readonly cursor: boolean;
}

export interface Picker {
  readonly rows: readonly PickerRow[];
  /** 小文字（low・medium・high・xhigh・max）。 */
  readonly effort: string | undefined;
}

const PICKER_ROW = /^\s*(❯)?\s*(\d+)\.\s+(.+?)(?:\s+✔)?\s{2,}\S/;
const PICKER_EFFORT = /\b(Low|Medium|High|xHigh|Max) effort(?: \(default\))? ←\/→/;

/** 画面のいちばん後ろの「Select model」から下を picker として読む。 */
export function findPicker(screen: string): Picker | undefined {
  const at = screen.lastIndexOf("Select model");
  if (at < 0) return undefined;
  const rows: PickerRow[] = [];
  let effort: string | undefined;
  for (const line of screen.slice(at).split("\n")) {
    const row = PICKER_ROW.exec(line);
    if (row !== null) {
      rows.push({ number: Number(row[2]), name: (row[3] ?? "").trim(), cursor: row[1] === "❯" });
      continue;
    }
    const e = PICKER_EFFORT.exec(line);
    if (e !== null) effort = (e[1] ?? "").toLowerCase();
  }
  return rows.length === 0 ? undefined : { rows, effort };
}

export interface SessionSwitch {
  readonly model: string;
  /** effort を替えなかったときは undefined（決定の行に出ない）。 */
  readonly effort: string | undefined;
}

/**
 * picker で s を押した後の 1 行（このセッションだけ・既定は書き換えない）。
 * いちばん後ろの「❯ /model」より下に在る物だけを見る（前の回の決定の行を読み違えないため）。
 */
export function findSessionSwitch(screen: string): SessionSwitch | undefined {
  const lines = screen.split("\n");
  let start = -1;
  lines.forEach((line, i) => {
    if (/^❯ \/model\s*$/.test(line)) start = i;
  });
  if (start < 0) return undefined;
  let last: SessionSwitch | undefined;
  for (const line of lines.slice(start + 1)) {
    const m = /Set model to (.+?) for this session only(?: with (\S+) effort)?/.exec(line);
    if (m !== null) last = { model: m[1] ?? "", effort: m[2]?.toLowerCase() };
  }
  return last;
}

export interface PromptArea {
  /** 入力の枠より上（会話の履歴）。 */
  readonly history: string;
  /** 入力の行の「❯」より後ろ。 */
  readonly input: string;
}

/**
 * 画面の下の入力の枠を見つける。枠は ─ の罫線 2 本に挟まれ、間に「❯」の行が在る。
 * 見つからなければ undefined。
 */
export function findPromptArea(screen: string): PromptArea | undefined {
  const lines = screen.replace(/\s+$/, "").split("\n");
  for (let i = lines.length - 1; i >= 1; i -= 1) {
    const line = lines[i] ?? "";
    const prompt = /^❯\s?(.*)$/.exec(line);
    if (prompt === null) continue;
    const above = lines[i - 1] ?? "";
    if (!/^─{10,}/.test(above)) continue;
    return { history: lines.slice(0, i - 1).join("\n"), input: (prompt[1] ?? "").trim() };
  }
  return undefined;
}

/** 入力の枠が空か（例の文「Try "…"」は空と見なす）。 */
export function isInputEmpty(area: PromptArea): boolean {
  return area.input === "" || area.input.startsWith('Try "');
}
