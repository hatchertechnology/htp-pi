import { test } from "node:test";
import assert from "node:assert/strict";
import { discover, status } from "../extensions/htp-pi/lib/seosmith-adapter.mjs";
import { capabilityReport } from "../extensions/htp-pi/lib/capabilities.mjs";

const binary = process.execPath;
const id = "b2a844c8-5bc9-49e5-bcf0-8fd1407d69f4";

function stub(operations, omit = false) {
  const calls = [];
  const response = { adapter_version: 1, transport: "local_cli" };
  if (!omit) response.operations = operations;
  const exec = async (_command, args) => {
    calls.push(args);
    return { code: 0, stdout: JSON.stringify(args.includes("capabilities") ? response : { state: "complete" }) };
  };
  return { exec, calls };
}

test("missing, null and invalid operation lists cannot enable a lifecycle operation", async () => {
  for (const [operations, omit] of [[undefined, true], [null, false], ["seosmith.status", false], [{}, false], [["seosmith.status", 1], false]]) {
    const { exec, calls } = stub(operations, omit);
    const caps = await discover({ exec, binary });
    assert.deepEqual(caps.operations, []);
    assert.deepEqual(capabilityReport({ seosmith: { available: true, operations: caps.operations } }).seosmith.operations, []);
    await assert.rejects(status({ exec, binary, database: "/tmp/audit.sqlite", id }), { code: "unsupported" });
    assert.ok(calls.every((args) => args.includes("capabilities")));
  }
});

test("explicit subsets and empty lists remain authoritative", async () => {
  for (const operations of [[], ["seosmith.status"], ["seosmith.status", "future.operation"]]) {
    const { exec, calls } = stub(operations);
    const caps = await discover({ exec, binary });
    assert.deepEqual(caps.operations, operations);
    assert.deepEqual(capabilityReport({ seosmith: { available: true, operations: caps.operations } }).seosmith.operations, operations);
    if (operations.includes("seosmith.status")) {
      assert.equal((await status({ exec, binary, database: "/tmp/audit.sqlite", id })).state, "complete");
      assert.ok(calls.some((args) => args.includes("status")));
    } else {
      await assert.rejects(status({ exec, binary, database: "/tmp/audit.sqlite", id }), { code: "unsupported" });
    }
  }
});
