import test from "node:test";
import assert from "node:assert/strict";

import {
  extractDelimitedGitTokens,
  findCommitPins,
  parseCommitPin,
} from "../scripts/rollback-pin.mjs";

const SHA = "0a386f04b03087ab4c16834e64bdd5c362ec6618";
const TOKEN = `git:github.com/hatchertechnology/htp-pi@${SHA}`;

test("accepts a backticked full 40-hex git pin", () => {
  const pins = findCommitPins(`install \`${TOKEN}\` now`);
  assert.equal(pins.length, 1);
  assert.equal(pins[0].token, TOKEN);
  assert.equal(pins[0].source, "git:github.com/hatchertechnology/htp-pi");
  assert.equal(pins[0].ref, SHA);
});

test("ignores tags, placeholders and un-delimited tokens", () => {
  assert.deepEqual(findCommitPins("`git:github.com/a/b@v1.2.3`"), []);
  assert.deepEqual(findCommitPins("`git:github.com/a/b@v1`"), []);
  assert.deepEqual(findCommitPins("`git:github.com/a/b@<full-40-hex-sha>`"), []);
  assert.deepEqual(findCommitPins(`plain ${TOKEN} not delimited`), []);
  assert.deepEqual(findCommitPins(`\`pi install ${TOKEN}\``), []);
});

test("rejects any suffixed ref, regardless of suffix character", () => {
  // Git refs may contain '+', '=', ',', ')', '!', etc.; all must be rejected
  // because the delimited token's ref is validated whole and anchored.
  for (const suffix of ["+suffix", "-suffix", ".suffix", "=x", ",x", ")x", "!x", "a", "Z", "/x", "_x"]) {
    const text = `\`git:github.com/hatchertechnology/htp-pi@${SHA}${suffix}\``;
    assert.deepEqual(findCommitPins(text), [], `suffix ${JSON.stringify(suffix)} must not pass`);
  }
});

test("rejects 41-hex, short and uppercase-hex refs", () => {
  assert.deepEqual(findCommitPins(`\`git:github.com/a/b@${SHA}a\``), []);
  assert.deepEqual(findCommitPins(`\`git:github.com/a/b@${SHA.slice(0, 39)}\``), []);
  assert.deepEqual(findCommitPins(`\`git:github.com/a/b@${SHA.toUpperCase()}\``), []);
});

test("parseCommitPin rejects malformed tokens directly", () => {
  assert.equal(parseCommitPin(TOKEN).ref, SHA);
  assert.equal(parseCommitPin("git:github.com/a/b"), null);
  assert.equal(parseCommitPin("git:@0a386f04b03087ab4c16834e64bdd5c362ec6618"), null);
  assert.equal(parseCommitPin(`https://github.com/a/b@${SHA}`), null);
  assert.equal(parseCommitPin(42), null);
});

test("extractDelimitedGitTokens returns only backticked git tokens", () => {
  assert.deepEqual(extractDelimitedGitTokens("`git:github.com/a/b@x` and `pi x`"), [
    "git:github.com/a/b@x",
  ]);
});
