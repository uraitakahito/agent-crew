# profile（環境ごとの値）

profile は、環境ごとに違う値を集めた JSON です。repo に置くのは見本（`profiles/example/`）だけで、本物の値は repo の外（既定は `~/.config/agent-crew/profiles/<名前>/`）に置きます。

```sh
bin/crew profile init <名前>             # 見本を ~/.config/agent-crew/profiles/<名前>/ に写す
bin/crew profile check --profile <名前>   # 役と雛形を全部組み立てられるかを見る
```

`crew profile check` は、役・雛形・部品の穴（`{{名前}}`・`{{> 部品}}`）を走査して profile に要る物を割り出し、欠けている物を全部挙げます。要る物の一覧を別に持たないので、穴を足せば check がすぐに気づきます。

## profile.json の鍵

| 鍵               | 中身                                                                                                         |
| ---------------- | ------------------------------------------------------------------------------------------------------------ |
| `launcher`       | 起こし方の種類。いまは `cmux` だけ                                                                           |
| `cwd`            | 役を起こす作業フォルダ。Claude Code が信頼済みのフォルダにする（信頼していないと、確認のダイアログで止まる） |
| `permissionMode` | `--permission-mode` に渡す値。見本は `default`（確認を求める側）                                             |
| `models`         | 選べるモデルの `id`（`--model` に渡す名前）と `display`（起動の行と picker に出る名前）                      |
| `efforts`        | 選べる effort の段                                                                                           |
| `values`         | 役の定義と雛形の穴に入れる値（下の表）                                                                       |

## values の鍵

| 鍵                      | 中身                                            | 見本                                          |
| ----------------------- | ----------------------------------------------- | --------------------------------------------- |
| `language`              | 返答と報告の言語                                | `日本語`                                      |
| `tpm.address`           | TPM 役の宛先                                    | `workspace:1`                                 |
| `devops.address`        | DevOps 役の宛先                                 | `workspace:2`                                 |
| `messageCommand`        | ほかのセッションに知らせる命令の形              | `cmux agent message <宛先> …`                 |
| `waitStatusCommand`     | 返事を待つ間の印を立てる命令                    | `cmux set-status wait …`                      |
| `clearStatusCommand`    | 待ちの印を消す命令                              | `cmux clear-status wait …`                    |
| `userWaitStatusCommand` | Product Manager の判断を待つ間の印を立てる命令  | `cmux set-status user-wait …`                 |
| `openCommand`           | TPM 役の workspace で URL を開く命令            | `cmux open <URL> --workspace <TPM 役の UUID>` |
| `openHereCommand`       | 自分の workspace で URL を開く命令              | `cmux open <URL>`                             |
| `openOk`                | 開けたときに出る字                              | `OK urls=1`                                   |
| `issueTracker`          | 作業項目の置き場                                | `GitHub Issues`                               |
| `sharedEnvironment`     | 共有の開発環境の名前（DevOps 役が受け持つ物）   | `コンテナ・共有の開発環境`                    |
| `bannedTerms`           | 新しく書く文に使わない語                        | `（無し）`                                    |
| `mainCheckoutUpdate`    | main に入った後の、本体の checkout の最新にし方 | `git pull --ff-only`                          |

## 部品

雛形と役は、部品（`{{> 名前}}`）を profile の `partials/` から先に探し、無ければ repo の `templates/partials/` を使います。repo に無い部品は、profile に置きます。

| 部品                        | 中身                                                                                                  |
| --------------------------- | ----------------------------------------------------------------------------------------------------- |
| `partials/project-rules.md` | プロジェクト固有の決まり（読ませる記録・作業項目の扱い・worktree の名前・版の打ち方・使わない語など） |

repo の部品と同じ名前の物を profile に置けば、その環境だけ差し替えられます。
