import test from "node:test";
import assert from "node:assert/strict";
import { resolveMongoUri } from "./database.js";

const uri =
  "mongodb+srv://test:p%40ss@cluster0.example.mongodb.net/ghost-files?retryWrites=true";
function resolver(
  records = [{ name: "shard0.example.mongodb.net", port: 27017 }],
  txt = [["authSource=admin&replicaSet=atlas-test"]],
) {
  return {
    setServers(servers) {
      assert.deepEqual(servers, ["1.1.1.1"]);
    },
    async resolveSrv(host) {
      assert.equal(host, "_mongodb._tcp.cluster0.example.mongodb.net");
      return records;
    },
    async resolveTxt() {
      return txt;
    },
  };
}
test("explicit DNS preserves encoded credentials, database, TLS and replica settings", async () => {
  const resolved = await resolveMongoUri(uri, "1.1.1.1", resolver());
  const url = new URL(resolved);
  assert.equal(url.protocol, "mongodb:");
  assert.equal(url.password, "p%40ss");
  assert.equal(url.pathname, "/ghost-files");
  assert.equal(url.searchParams.get("tls"), "true");
  assert.equal(url.searchParams.get("replicaSet"), "atlas-test");
  assert.equal(url.searchParams.get("authSource"), "admin");
  assert.equal(url.searchParams.get("retryWrites"), "true");
  const override = await resolveMongoUri(
    uri + "&authSource=custom",
    "1.1.1.1",
    resolver(),
  );
  assert.equal(new URL(override).searchParams.get("authSource"), "custom");
});
test("normal connections use the original URI unless DNS override is configured", async () => {
  assert.equal(await resolveMongoUri(uri), uri);
  assert.equal(
    await resolveMongoUri("mongodb://localhost/ghost-files", "1.1.1.1"),
    "mongodb://localhost/ghost-files",
  );
});
test("DNS override rejects unrelated hosts, unsafe TXT and disabled TLS", async () => {
  await assert.rejects(
    resolveMongoUri(
      uri,
      "1.1.1.1",
      resolver([{ name: "attacker.test", port: 27017 }]),
    ),
  );
  await assert.rejects(resolveMongoUri(uri, "1.1.1.1", resolver([], [])));
  await assert.rejects(
    resolveMongoUri(uri, "1.1.1.1", resolver(undefined, [["tls=false"]])),
  );
  await assert.rejects(
    resolveMongoUri(uri + "&tls=false", "1.1.1.1", resolver()),
  );
  await assert.rejects(
    resolveMongoUri(
      uri,
      "1.1.1.1",
      resolver(undefined, [["authSource=admin"], ["replicaSet=other"]]),
    ),
  );
});
