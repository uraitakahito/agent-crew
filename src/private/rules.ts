/**
 * 公開の repo に入れてはいけない値を「形」で探す規則。
 *
 * 本物の値そのもの（宛先の ID・課題管理の URL など）はここに書かない。書けば、この
 * ファイル自体が混入になる。本物の値を literal で照らしたいときは、repo の外の語の一覧
 * （`src/private/terms.ts`）に書く。
 */
export interface Rule {
  readonly id: string;
  readonly description: string;
  /** 必ず `g` を付ける（1 行の中の全部の一致を見るため）。 */
  readonly pattern: RegExp;
  /** true を返した一致は見逃す（見本の値など）。 */
  readonly allow?: (match: string) => boolean;
}

/** 見本に使ってよい UUID の頭。本物の UUID がこの形になることは、まず無い。 */
const SAMPLE_UUID_PREFIX = "00000000-0000-";

/** 見本に使ってよいメールアドレスの domain（RFC 2606・RFC 6761 の予約）。 */
const SAMPLE_EMAIL_DOMAIN = /(?:^|\.)(?:example\.(?:com|org|net)|example|test|invalid)$/i;

/** 公開の場所で誰もが書くアドレス（commit の署名の行など）。 */
const PUBLIC_EMAILS = new Set(["noreply@anthropic.com", "noreply@github.com", "git@github.com"]);

/**
 * 課題管理のキーに似るが、そうではない語の頭。足すときは、誤検出の実例を試験に足す。
 */
const NOT_ISSUE_KEY_PREFIXES = new Set(["UTF", "SHA", "ISO", "RFC", "CVE", "ECMA", "IEC"]);

export const RULES: readonly Rule[] = [
  {
    id: "uuid",
    description: "UUID（宛先の ID など）",
    pattern: /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi,
    allow: (m) => m.startsWith(SAMPLE_UUID_PREFIX),
  },
  {
    id: "cmux-ref",
    description: "端末の番号つきの参照（4 桁以上。見本は 3 桁までの番号で書く）",
    pattern: /\b(?:window|workspace|pane|surface|tab):\d{4,}\b/g,
  },
  {
    id: "home-path",
    description: "利用者の名前を含む絶対パス（`~/…` か `<…>` で書く）",
    pattern: /(?:\/Users|\/home)\/[A-Za-z0-9._-]+\//g,
  },
  {
    id: "email",
    description: "メールアドレス（見本は example.com などで書く）",
    pattern: /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}\b/g,
    allow: (m) => {
      if (PUBLIC_EMAILS.has(m.toLowerCase())) return true;
      const domain = m.slice(m.indexOf("@") + 1);
      return SAMPLE_EMAIL_DOMAIN.test(domain);
    },
  },
  {
    id: "issue-tracker-url",
    description: "課題管理の URL",
    pattern: /\b[a-z0-9-]+\.atlassian\.net\b/gi,
  },
  {
    id: "issue-key",
    description: "課題管理の作業項目のキー（例の形は <キー> と書く）",
    pattern: /\b[A-Z][\dA-Z]{1,9}-\d+\b/g,
    allow: (m) => NOT_ISSUE_KEY_PREFIXES.has(m.slice(0, m.indexOf("-"))),
  },
  {
    id: "claude-link",
    description: "claude.ai の会話・Artifact のリンク",
    pattern: /\bclaude\.ai\/(?:artifact|chat|project|code\/artifact)\/[A-Za-z0-9_-]+/g,
  },
];
