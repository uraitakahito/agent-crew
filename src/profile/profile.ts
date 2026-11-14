import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";
import { CrewError } from "../errors.js";

/**
 * profile: 環境ごとに違う値。repo には見本（`profiles/example/`）だけを置き、本物は repo の外
 * （既定は `~/.config/agent-crew/profiles/<名前>/profile.json`）に置く。
 */
export interface ModelChoice {
  /** `--model` に渡す名前（例 claude-opus-5-5）。 */
  readonly id: string;
  /** 起動の行と picker に出る名前（例 Opus 5.5）。 */
  readonly display: string;
}

export interface Profile {
  /** profile.json の在る場所（相対のパスの基準）。 */
  readonly dir: string;
  readonly launcher: "cmux";
  /** 役を起こす作業フォルダ（Claude Code が信頼済みのフォルダにする）。 */
  readonly cwd: string;
  /** `--permission-mode` に渡す値。 */
  readonly permissionMode: string;
  readonly models: readonly ModelChoice[];
  readonly efforts: readonly string[];
  /** 役の定義と雛形の穴（`{{名前}}`）に入れる値。 */
  readonly values: Readonly<Record<string, string>>;
}

export const PROFILE_ENV = "CREW_PROFILE";

export function profilesRoot(home = homedir()): string {
  return join(home, ".config", "agent-crew", "profiles");
}

/** 名前か、profile.json の在るフォルダのパスを、profile.json のパスにする。 */
export function profilePath(nameOrPath: string, home = homedir()): string {
  if (nameOrPath.includes("/") || nameOrPath.startsWith(".")) {
    const dir = isAbsolute(nameOrPath) ? nameOrPath : resolve(expandHome(nameOrPath, home));
    return dir.endsWith(".json") ? dir : join(dir, "profile.json");
  }
  return join(profilesRoot(home), nameOrPath, "profile.json");
}

export function expandHome(path: string, home = homedir()): string {
  if (path === "~") return home;
  if (path.startsWith("~/")) return join(home, path.slice(2));
  return path;
}

type Json = Record<string, unknown>;

function isObject(value: unknown): value is Json {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function need<T>(obj: Json, key: string, guard: (v: unknown) => v is T, what: string): T {
  const value = obj[key];
  if (value === undefined) throw new CrewError(`profile に鍵 "${key}" が無い（${what}）`);
  if (!guard(value)) throw new CrewError(`profile の鍵 "${key}" の形が違う（${what}）`);
  return value;
}

const isString = (v: unknown): v is string => typeof v === "string" && v !== "";
const isStringArray = (v: unknown): v is string[] =>
  Array.isArray(v) && v.length > 0 && v.every(isString);
const isValues = (v: unknown): v is Record<string, string> =>
  isObject(v) && Object.values(v).every((x) => typeof x === "string");
const isModels = (v: unknown): v is ModelChoice[] =>
  Array.isArray(v) &&
  v.length > 0 &&
  v.every((m) => isObject(m) && isString(m["id"]) && isString(m["display"]));

export function parseProfile(text: string, dir: string, home = homedir()): Profile {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (error) {
    throw new CrewError(`profile の JSON が読めない: ${(error as Error).message}`);
  }
  if (!isObject(raw)) throw new CrewError("profile は JSON の object にする");
  const launcher = need(raw, "launcher", isString, "launcher の種類。いまは cmux だけ");
  if (launcher !== "cmux")
    throw new CrewError(`profile の launcher "${launcher}" は知らない（いまは cmux だけ）`);
  return {
    dir,
    launcher,
    cwd: expandHome(need(raw, "cwd", isString, "役を起こす作業フォルダ"), home),
    permissionMode: need(raw, "permissionMode", isString, "--permission-mode に渡す値"),
    models: need(raw, "models", isModels, "選べるモデルの id と表示名の一覧"),
    efforts: need(raw, "efforts", isStringArray, "選べる effort の段の一覧"),
    values: need(raw, "values", isValues, "役の定義と雛形の穴に入れる値（文字列だけ）"),
  };
}

export function loadProfile(nameOrPath: string | undefined, home = homedir()): Profile {
  const given = nameOrPath ?? process.env[PROFILE_ENV];
  if (given === undefined || given === "") {
    throw new CrewError(`profile を渡してください（--profile <名前> か、環境変数 ${PROFILE_ENV}）`);
  }
  const path = profilePath(given, home);
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch {
    throw new CrewError(`profile が読めない: ${path}`);
  }
  return parseProfile(text, join(path, ".."), home);
}

/** モデルと effort が profile の一覧に在るかを照らす。無ければ起こす前に止める。 */
export function resolveChoice(profile: Profile, model: string, effort: string): ModelChoice {
  const choice = profile.models.find((m) => m.id === model);
  if (choice === undefined) {
    const known = profile.models.map((m) => m.id).join("・");
    throw new CrewError(`知らないモデル "${model}"（profile に在るのは ${known}）`);
  }
  if (!profile.efforts.includes(effort)) {
    throw new CrewError(
      `知らない effort "${effort}"（profile に在るのは ${profile.efforts.join("・")}）`,
    );
  }
  return choice;
}
