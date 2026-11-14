/** 利用者に見せて止まる失敗。message は日本語で、何をすればよいかまで書く。 */
export class CrewError extends Error {
  /** 失敗の手がかり（画面の末尾など）。標準エラーに続けて出す。 */
  readonly detail: string | undefined;

  constructor(message: string, detail?: string) {
    super(message);
    this.name = "CrewError";
    this.detail = detail;
  }
}
