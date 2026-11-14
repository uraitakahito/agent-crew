import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { CrewError } from "./errors.js";

/**
 * 古い dist/ で動かさない。crew は build した dist/ を走らせるので、本体を pull した後に build を
 * 忘れると、古い crew が黙って動く。build のときに建てた commit を dist/build-info.json に書き、
 * 起動のときに今の commit と比べる。
 */
export interface BuildInfo {
  readonly commit: string;
}

export const BUILD_INFO_FILE = "build-info.json";

/** dist/ と repo の根（この file は dist/build-info.js として走る）。 */
export function locations(moduleUrl = import.meta.url): { distDir: string; repoDir: string } {
  const distDir = dirname(fileURLToPath(moduleUrl));
  return { distDir, repoDir: join(distDir, "..") };
}

export type GitHead = (repoDir: string) => string | undefined;

export const gitHead: GitHead = (repoDir) => {
  try {
    return execFileSync("git", ["-C", repoDir, "rev-parse", "HEAD"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return undefined;
  }
};

export function readBuildInfo(distDir: string): BuildInfo | undefined {
  try {
    const value: unknown = JSON.parse(readFileSync(join(distDir, BUILD_INFO_FILE), "utf8"));
    if (
      typeof value === "object" &&
      value !== null &&
      "commit" in value &&
      typeof value.commit === "string"
    ) {
      return { commit: value.commit };
    }
  } catch {
    // 下で undefined
  }
  return undefined;
}

export function checkBuild(
  { distDir, repoDir }: { distDir: string; repoDir: string },
  head: GitHead = gitHead,
): void {
  const now = head(repoDir);
  // git の checkout でなければ（tarball で配ったなど）比べようがない。
  if (now === undefined) return;
  const built = readBuildInfo(distDir);
  if (built === undefined) {
    throw new CrewError(
      `dist/ に ${BUILD_INFO_FILE} が無い。${repoDir} で pnpm run build を打ってください`,
    );
  }
  if (built.commit !== now) {
    throw new CrewError(
      `dist/ は ${built.commit.slice(0, 12)} から建てた物で、いまの checkout は ${now.slice(0, 12)}。${repoDir} で pnpm run build を打ってください`,
    );
  }
}
