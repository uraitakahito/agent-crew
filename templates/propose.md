---
title: 提案
description: 案をいくつか出し、比べて、推しを言う
vars: ticket, topic, options, notes?
---

# 提案の依頼: {{topic}}

Technical Program Manager（TPM 役）から Software Engineer 役への依頼です。

- 依頼の種類: **提案**（案を出して比べる。まだ作らない）
- 作業項目: {{ticket}}
- 返答と報告: {{language}}
- 知らせの名乗り（--from）: 「{{ticket}} 提案」

## 何を

- {{topic}} について、案を {{options}} つ出して比べ、推しを 1 つ（理由つきで）言う。決めるのは Product Manager。

{{?notes}}

## やること

- 案ごとに、何が変わるか（場所と数・前後の例）・手間（PR の本数・リリース）・良い点と悪い点・危うい所・確かめ方を書き、比べる表を置く。
- 推しの理由と、Product Manager に決めてほしいこと（番号つき・既定の答えつき）を書く。
- 手で試すのは、費用が掛からず・外のアカウントに触れず・動いている共有の物に触れない物だけ。試した物と試していない物を分けて書く。

{{> prior-decisions}}

{{> read-only}}

{{> work-item}}

{{> results}}

{{> open-both}}

{{> breaking-ok}}

{{> shared-env}}

{{> ask-pm}}

{{> fix-drift}}

{{> project-rules}}

{{> report-short}}
