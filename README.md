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
