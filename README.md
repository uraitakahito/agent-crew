# agent-crew

Claude Code の役（Technical Program Manager・DevOps Engineer・Software Engineer）を起こし、
雛形から組み立てた依頼を渡すための道具です。命令は `crew` が 1 つで、次の 3 つを持ちます（作っている途中です）。

- `crew launch` — 新しいセッションに役を起こし、起動を確かめてから依頼を渡す
- `crew send` — 動いているセッションに依頼を渡す
- `crew render` — 雛形から依頼の文を組み立てる

## 使い方

```sh
pnpm install && pnpm run build
export CREW_PROFILE=<profile の名前>   # ~/.config/agent-crew/profiles/<名前>/profile.json

# 新しい workspace に役を起こし、依頼を渡す（モデル・effort・決めた人は毎回渡す。無ければ止まる）
bin/crew launch --role-file <役のファイル> --model claude-opus-5-5 --effort high --decided-by tpm --request <依頼のファイル>

# 動いているセッションのモデルと effort を替え、続けて頼む
bin/crew send --to <workspace> --model claude-haiku-5-5 --effort low --decided-by pm --request -
```

- `launch` は依頼を入れずに Claude Code を起こし、起動の行（例 `Opus 5.5 with high effort`）で頼んだモデルと effort を照らしてから、依頼を貼り付けて送ります。依頼の最後の行が会話に出たかも照らします。信頼していない作業フォルダで出る確認のダイアログ・起動の行が出ない・モデルが違う、のどれでも失敗で止まり、作った workspace を閉じます。
- `send` は `/model` の picker を開き、行と effort を合わせて `s`（このセッションだけ）で決めます。`/model <名前>` と `/effort <段>` は、利用者の設定の既定まで書き換えるので使いません。
- 依頼の文の頭には、`- モデル: … ／ effort: … ／ 決めた人: …` の 1 行が入ります。
- 標準出力には結果（宛先の ID など）の JSON だけを出し、ログは標準エラーに出します。
- build した `dist/` が今の commit と違えば、`pnpm run build` を打つよう言って止まります。

## 公開の repo です

この repo に置くのは、どの環境でも同じ物だけです（役の定義・依頼の雛形・launcher）。
宛先の ID・課題管理の URL・プロジェクトの決まりなどの本物の値は、repo の外
（既定は `~/.config/agent-crew/profiles/<名前>/`）に置きます。

## ライセンス

[MIT](LICENSE)

## 開発

Node 26 以上と pnpm 11 が要ります（版は `.nvmrc` と `package.json` の `packageManager`）。

```sh
pnpm install
pnpm run check   # audit → typecheck → lint → format:check → test → build → check:private
```

`check:private` は、本物の値の混入を形（UUID・利用者の名前を含む絶対パス・メールアドレス・課題管理の URL とキー・claude.ai のリンク）で探します。
手元の機械では、repo の外の `~/.config/agent-crew/private-terms.txt`（1 行に 1 語）に書いた語も literal で照らします（置き場は環境変数 `AGENT_CREW_PRIVATE_TERMS` で替えられます）。
CI は、ファイルに加えて PR の題・本文・commit の文も照らします。
