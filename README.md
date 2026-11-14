# agent-crew

Claude Code の役（Technical Program Manager・DevOps Engineer・Software Engineer）を起こし、
雛形から組み立てた依頼を渡すための道具です。命令は `crew` が 1 つで、次の 3 つを持ちます（作っている途中です）。

- `crew launch` — 新しいセッションに役を起こし、起動を確かめてから依頼を渡す
- `crew send` — 動いているセッションに依頼を渡す
- `crew render` — 雛形から依頼の文を組み立てる

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
