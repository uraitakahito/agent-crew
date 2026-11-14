/** 誰がモデルと effort を決めたか。 */
export const DECIDERS = {
  pm: "Product Manager",
  tpm: "TPM 役",
} as const;

export type Decider = keyof typeof DECIDERS;

export function isDecider(value: string): value is Decider {
  return Object.hasOwn(DECIDERS, value);
}

export interface Decision {
  readonly model: string;
  readonly effort: string;
  readonly decidedBy: Decider;
  /** 決めた理由（1 句）。TPM 役が決めたときは書く。 */
  readonly reason?: string;
}

/** 依頼の文の頭に入れる 1 行。起動の後に、画面の起動の行と照らす。 */
export function decisionLine(decision: Decision): string {
  const reason =
    decision.reason === undefined || decision.reason === "" ? "" : `（${decision.reason}）`;
  return `- モデル: ${decision.model} ／ effort: ${decision.effort} ／ 決めた人: ${DECIDERS[decision.decidedBy]}${reason}`;
}

/** 依頼の文に決めた人の 1 行を足す。 */
export function withDecisionLine(decision: Decision, request: string): string {
  return `${decisionLine(decision)}\n\n${request.replace(/^\n+/, "")}`;
}
