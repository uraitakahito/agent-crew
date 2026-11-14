---
title: 実行
description: 計画のとおりに作り、確かめ、記録を残す
vars: ticket, topic, plan, answers, notes?
---

# 実行の依頼: {{topic}}

Technical Program Manager（TPM 役）から Software Engineer 役への依頼です。

- 依頼の種類: **実行**（計画のとおりに作る）
- 作業項目: {{ticket}}
- 返答と報告: {{language}}
- 知らせの名乗り（--from）: 「{{ticket}} 実行」

## 何を

- 計画 {{plan}} のとおりに実行する。最初に計画を全部読む。計画が正。

## 決めてほしいことの答え

{{answers}}

{{?notes}}

{{> execute-rules}}

{{> work-item}}

{{> results}}

{{> open-both}}

{{> breaking-ok}}

{{> worktree}}

{{> release}}

{{> shared-env}}

{{> parallel}}

{{> ask-pm}}

{{> fix-drift}}

{{> leftovers}}

{{> project-rules}}

{{> report}}
