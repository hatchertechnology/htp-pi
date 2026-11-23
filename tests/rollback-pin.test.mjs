import test from "node:test";
import assert from "node:assert/strict";

import {
  expectedRollbackInstall,
  rollbackExampleErrors,
} from "../scripts/rollback-pin.mjs";

const SOURCE = "git:github.com/hatchertechnology/htp-pi";
const SHA = "0a386f04b03087ab4c16834e64bdd5c362ec6618";
const COMMAND = `pi install ${SOURCE}@${SHA}`;

test("builds the exact runnable install command from the structured example", () => {
  assert.equal(expectedRollbackInstall({ source: SOURCE, ref: SHA }), COMMAND);
});

test("rejects malformed canonical refs regardless of suffix character", () => {
  const refs = [
    `${SHA}+bad`,
    `${SHA}-bad`,
    `${SHA}=bad`,
    `${SHA},bad`,
    `${SHA})bad`,
    `${SHA}!bad`,
    `${SHA}.bad`,
    `${SHA}/bad`,
    `${SHA}_bad`,
    `${SHA}bad`,
    `${SHA}a`,
    SHA.slice(0, 39),
    SHA.toUpperCase(),
    "v1.0.0",
    "<full-40-hex-sha>",
    "",
  ];
  for (const ref of refs) {
    assert.equal(expectedRollbackInstall({ source: SOURCE, ref }), null, `ref ${JSON.stringify(ref)} must be rejected`);
  }
});

test("rejects non-git sources, array values and missing fields", () => {
  assert.equal(expectedRollbackInstall({ source: "https://github.com/a/b", ref: SHA }), null);
  assert.equal(expectedRollbackInstall({ source: SOURCE }), null);
  assert.equal(expectedRollbackInstall({ ref: SHA }), null);
  assert.equal(expectedRollbackInstall(undefined), null);
  assert.equal(expectedRollbackInstall(null), null);
  assert.equal(expectedRollbackInstall([SOURCE, SHA]), null);
});

test("valid example passes when the exact command is documented in both places", () => {
  assert.deepEqual(
    rollbackExampleErrors({
      example: { source: SOURCE, ref: SHA },
      rollback: `remove, then run \`${COMMAND}\``,
      packageDoc: `run \`${COMMAND}\` to roll back`,
    }),
    [],
  );
});

test("a malformed canonical example fails even with an unrelated valid pin present", () => {
  // Regression: a free-form scan could match the unrelated pin and pass.
  const unrelated = `\`git:github.com/example/other@${SHA}\``;
  const errors = rollbackExampleErrors({
    example: { source: SOURCE, ref: `${SHA}-bad` },
    rollback: `unrelated ${unrelated}; canonical \`pi install ${SOURCE}@${SHA}-bad\``,
    packageDoc: `unrelated ${unrelated}`,
  });
  assert.equal(errors.length, 1);
  assert.match(errors[0], /40-hex/);
});

test("valid example fails when either documented command is malformed", () => {
  const badRollback = rollbackExampleErrors({
    example: { source: SOURCE, ref: SHA },
    rollback: `\`pi install ${SOURCE}@${SHA}+bad\``,
    packageDoc: `\`${COMMAND}\``,
  });
  assert.equal(badRollback.length, 1);
  assert.match(badRollback[0], /distribution\.rollback/);

  const badDocs = rollbackExampleErrors({
    example: { source: SOURCE, ref: SHA },
    rollback: `\`${COMMAND}\``,
    packageDoc: `\`pi install ${SOURCE}@${SHA}+bad\``,
  });
  assert.equal(badDocs.length, 1);
  assert.match(badDocs[0], /docs\/package\.md/);
});
