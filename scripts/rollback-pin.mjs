// Structured canonical rollback example for the offline package guard.
//
// The contract carries the canonical package source and commit as structured
// fields. The guard builds the exact runnable install command and requires the
// published docs (and the rollback field) to contain that command verbatim.
// This is narrow by construction: it cannot be satisfied by an unrelated valid
// pin in prose, and a malformed ref for the canonical example is rejected even
// when another valid pin exists. Tags remain valid in unrelated examples.

export const FULL_COMMIT_REF = /^[0-9a-f]{40}$/;

/**
 * Build the exact runnable install command for a structured rollback example.
 * Returns null when the example is missing, is not a `git:` source, or does
 * not pin a full 40-hex commit.
 */
export function expectedRollbackInstall(example) {
  if (example === null || typeof example !== "object" || Array.isArray(example)) return null;
  const { source, ref } = example;
  if (typeof source !== "string" || !source.startsWith("git:")) return null;
  if (typeof ref !== "string" || !FULL_COMMIT_REF.test(ref)) return null;
  return `pi install ${source}@${ref}`;
}

/**
 * Validate the structured example and its documentation. Returns an array of
 * human-readable errors (empty when valid). The exact delimited command is
 * required in both the contract rollback text and the published docs, so a
 * malformed canonical ref cannot hide behind an unrelated valid pin.
 */
export function rollbackExampleErrors({ example, rollback = "", packageDoc = "" } = {}) {
  const errors = [];
  const expected = expectedRollbackInstall(example);
  if (!expected) {
    errors.push(
      "distribution.rollbackExample must give a git: source and a full 40-hex commit ref",
    );
    return errors;
  }
  const delimited = `\`${expected}\``;
  if (!String(rollback).includes(delimited)) {
    errors.push(`distribution.rollback must contain the exact runnable command ${delimited}`);
  }
  if (!String(packageDoc).includes(delimited)) {
    errors.push(`docs/package.md must contain the exact runnable rollback install command ${delimited}`);
  }
  return errors;
}
