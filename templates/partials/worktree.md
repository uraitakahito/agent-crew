## 作業の場所

- 本体の checkout では作業しない。worktree を作って作業し、PR を出し、CI が緑になってから入れる。merge の前に、最新の main に載せ直す。
- main に入ったら、worktree と枝を消し、本体の checkout を最新にする（{{mainCheckoutUpdate}}）。
- ファイルは名指しで add する（全部をまとめて add しない）。
