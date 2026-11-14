/**
 * 本物の値の混入の検査（`pnpm run check:private`）。
 *
 * 見る物: git が追跡しているファイルと、追跡していないが ignore されていないファイル。
 * `--commits <範囲>` で commit の文も、`--extra-file <path>` で PR の題と本文なども見る。
 * 見つけた値は伏せて出す（CI の記録は公開）。1 つでも見つけたら終了コード 1。
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { Command } from "commander";
import { RULES } from "../private/rules.js";
import { isBinary, scanText, termRules, type Finding } from "../private/scan.js";
import { defaultTermsPath, loadTerms, TERMS_ENV } from "../private/terms.js";

function listFiles(): string[] {
  const out = execFileSync(
    "git",
    ["ls-files", "-z", "--cached", "--others", "--exclude-standard"],
    {
      encoding: "utf8",
    },
  );
  // 改行で切らない: 名前に ASCII でない字があると、core.quotepath の既定で引用符が付く。
  return [...new Set(out.split("\0").filter((name) => name !== ""))].filter((name) =>
    existsSync(name),
  );
}

function commitMessages(range: string): { sha: string; body: string }[] {
  const out = execFileSync("git", ["log", "--format=%H%x00%B%x00", range], { encoding: "utf8" });
  const parts = out.split("\0");
  const result: { sha: string; body: string }[] = [];
  for (let i = 0; i + 1 < parts.length; i += 2) {
    result.push({ sha: (parts[i] ?? "").trim(), body: parts[i + 1] ?? "" });
  }
  return result.filter((c) => c.sha !== "");
}

const program = new Command()
  .name("check-private")
  .option("--commits <range>", "commit の文も見る（例 origin/main..HEAD）")
  .option("--extra-file <path...>", "ほかに見るファイル（PR の題と本文など）")
  .parse();

const opts = program.opts<{ commits?: string; extraFile?: string[] }>();

const termsPath = process.env[TERMS_ENV] ?? defaultTermsPath();
const terms = loadTerms(termsPath);
const rules = [...RULES, ...termRules(terms ?? [])];

const findings: Finding[] = [];
let scanned = 0;
for (const name of [...listFiles(), ...(opts.extraFile ?? [])]) {
  const bytes = readFileSync(name);
  if (isBinary(bytes)) continue;
  findings.push(...scanText(name, bytes.toString("utf8"), rules));
  scanned += 1;
}
if (opts.commits !== undefined) {
  for (const commit of commitMessages(opts.commits)) {
    findings.push(...scanText(`commit ${commit.sha.slice(0, 12)}`, commit.body, rules));
    scanned += 1;
  }
}

const termsNote =
  terms === null ? "外の語の一覧は無く、形だけで探した" : `外の語 ${terms.length} 個も照らした`;
if (findings.length === 0) {
  process.stdout.write(`check:private: ${scanned} 個を見て、混入は無い（${termsNote}）\n`);
} else {
  for (const f of findings) {
    process.stdout.write(`${f.source}:${f.line}: ${f.ruleId} ${f.masked}\n`);
  }
  process.stdout.write(
    `check:private: ${findings.length} 件の混入の疑い（${termsNote}）。値を repo の外へ移すか、見本の形に替える\n`,
  );
  process.exitCode = 1;
}
