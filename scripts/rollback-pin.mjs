// Rollback-pin parsing for the offline package guard.
//
// The published rollback example must show an immutable git source pin. The
// prose delimits the source token with backticks, so the token is parsed whole
// and its ref is validated with an anchored pattern. This avoids a denylist of
// trailing characters (Git refs may contain many characters) and continues to
// allow tags and other refs elsewhere in the docs.

const DELIMITED_GIT_TOKEN = /`(git:[^`\s]+)`/g;
const COMMIT_REF = /^[0-9a-f]{40}$/;

/** Extract backticked git source tokens from text. */
export function extractDelimitedGitTokens(text) {
  return [...String(text).matchAll(DELIMITED_GIT_TOKEN)].map((match) => match[1]);
}

/**
 * Parse a delimited git source token. Returns `{ source, ref, token }` when the
 * ref is exactly a 40-hex commit, otherwise null (for example a tag or a
 * placeholder).
 */
export function parseCommitPin(token) {
  if (typeof token !== "string" || !token.startsWith("git:")) return null;
  const at = token.lastIndexOf("@");
  if (at <= "git:".length) return null;
  const source = token.slice(0, at);
  const ref = token.slice(at + 1);
  if (!COMMIT_REF.test(ref)) return null;
  return { source, ref, token };
}

/** Find every delimited git token in text whose ref is a full 40-hex commit. */
export function findCommitPins(text) {
  return extractDelimitedGitTokens(text).map(parseCommitPin).filter(Boolean);
}
