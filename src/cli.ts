import { readFileSync } from "node:fs";
import { Command } from "commander";
import { checkBuild, locations } from "./build-info.js";
import { prepareRole, readRequest, requireDecision } from "./commands/common.js";
import { withDecisionLine } from "./decision.js";
import { CrewError } from "./errors.js";
import { CmuxLauncher } from "./launchers/cmux/launcher.js";
import { createLogger } from "./log.js";
import { loadProfile, resolveChoice } from "./profile/profile.js";

const log = createLogger();
const { repoDir, distDir } = locations();
const readStdin = () => readFileSync(0, "utf8");

interface CommonOptions {
  profile?: string;
  model?: string;
  effort?: string;
  decidedBy?: string;
  request?: string;
}

function addCommon(command: Command): Command {
  return command
    .option("--profile <名前|パス>", "環境ごとの値（既定は環境変数 CREW_PROFILE）")
    .option("--model <id>", "モデル（例 claude-opus-5-5）。必須")
    .option("--effort <段>", "effort（例 high）。必須")
    .option("--decided-by <pm|tpm>", "モデルと effort を決めた人。必須")
    .option("--request <ファイル|->", "渡す依頼の文（- なら標準入力）");
}

const program = new Command()
  .name("crew")
  .description("Claude Code の役を起こし、依頼を渡す")
  .showHelpAfterError();

addCommon(
  program
    .command("launch")
    .description("新しい workspace に役を起こし、起動を確かめてから依頼を渡す")
    .option("--role <名前>", "役（roles/<名前>.md）")
    .option("--role-file <パス>", "役の定義のファイル（--role の代わり）")
    .option("--name <名前>", "workspace とセッションの名前")
    .option("--cwd <パス>", "作業フォルダ（既定は profile の cwd）")
    .option("--open <URL...>", "起こした workspace と呼んだ側の workspace の両方で開く"),
).action(
  async (
    options: CommonOptions & {
      role?: string;
      roleFile?: string;
      name?: string;
      cwd?: string;
      open?: string[];
    },
  ) => {
    const decision = requireDecision(options);
    checkBuild({ repoDir, distDir });
    const profile = loadProfile(options.profile);
    const model = resolveChoice(profile, decision.model, decision.effort);
    const role = prepareRole(repoDir, profile, options.role, options.roleFile);
    const request =
      options.request === undefined
        ? undefined
        : withDecisionLine(decision, readRequest(options.request, readStdin));
    const launcher = new CmuxLauncher({ log });
    const target = await launcher.launch({
      name: options.name ?? `crew ${role.name}`,
      cwd: options.cwd ?? profile.cwd,
      model,
      effort: decision.effort,
      permissionMode: role.permissionMode,
      roleFile: role.path,
      ...(request === undefined ? {} : { request }),
    });
    for (const url of options.open ?? []) {
      await launcher.open(url, target.id);
      await launcher.open(url);
    }
    process.stdout.write(
      `${JSON.stringify({ workspace_ref: target.ref, workspace_id: target.id, model: decision.model, effort: decision.effort, decided_by: decision.decidedBy })}\n`,
    );
  },
);

addCommon(
  program
    .command("send")
    .description("動いているセッションのモデルと effort を（このセッションだけ）替え、依頼を渡す")
    .requiredOption("--to <workspace>", "宛先（workspace の ref か UUID）"),
).action(async (options: CommonOptions & { to: string }) => {
  const decision = requireDecision(options);
  checkBuild({ repoDir, distDir });
  const profile = loadProfile(options.profile);
  const model = resolveChoice(profile, decision.model, decision.effort);
  const request =
    options.request === undefined
      ? undefined
      : withDecisionLine(decision, readRequest(options.request, readStdin));
  await new CmuxLauncher({ log }).send(options.to, {
    model,
    effort: decision.effort,
    ...(request === undefined ? {} : { request }),
  });
  process.stdout.write(
    `${JSON.stringify({ workspace: options.to, model: decision.model, effort: decision.effort, decided_by: decision.decidedBy })}\n`,
  );
});

try {
  await program.parseAsync();
} catch (error) {
  if (error instanceof CrewError) {
    process.stderr.write(`crew: ${error.message}\n`);
    if (error.detail !== undefined) process.stderr.write(`--- 画面の末尾 ---\n${error.detail}\n`);
    process.exitCode = 1;
  } else {
    throw error;
  }
}
