import { Resolver } from "node:dns/promises";

// An explicit resolver is optional. It is useful on networks whose default DNS
// cannot resolve Atlas SRV records; no system-wide DNS settings are changed.
export async function resolveMongoUri(uri, dnsServers = "", resolver) {
  if (!dnsServers || !uri.startsWith("mongodb+srv://")) return uri;
  const url = new URL(uri);
  const dns = resolver || new Resolver({ timeout: 4000, tries: 2 });
  dns.setServers(dnsServers.split(",").map((value) => value.trim()));
  const records = await dns.resolveSrv(`_mongodb._tcp.${url.hostname}`);
  const parent = "." + url.hostname.split(".").slice(1).join(".");
  if (
    !records.length ||
    url.hostname.split(".").length < 3 ||
    records.some(
      (record) =>
        !record.name.endsWith(parent) ||
        !Number.isInteger(record.port) ||
        record.port < 1 ||
        record.port > 65535,
    )
  )
    throw new Error("Invalid MongoDB DNS response.");
  let txt;
  try {
    txt = await dns.resolveTxt(url.hostname);
  } catch (error) {
    if (!["ENODATA", "ENOTFOUND"].includes(error.code)) throw error;
    txt = [];
  }
  if (txt.length > 1) throw new Error("Invalid MongoDB DNS options.");
  const options = new URLSearchParams(url.search);
  if (txt.length)
    for (const [key, value] of new URLSearchParams(txt[0].join(""))) {
      if (!["authSource", "replicaSet", "loadBalanced"].includes(key) || !value)
        throw new Error("Invalid MongoDB DNS option.");
      if (!options.has(key)) options.set(key, value);
    }
  if (options.get("tls") === "false" || options.get("ssl") === "false")
    throw new Error("TLS is required for MongoDB SRV connections.");
  options.set("tls", "true");
  const hosts = records
    .map((record) => `${record.name}:${record.port}`)
    .join(",");
  const credentials = url.username ? `${url.username}:${url.password}@` : "";
  return `mongodb://${credentials}${hosts}${url.pathname}?${options}`;
}
