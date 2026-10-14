// Verifies a locally-held private key actually derives the expected
// address, without ever printing the key itself. Addresses are public,
// so printing those is fine; the key never is.
//
// Usage:
//   node scripts/relayer/verify-local-key.mjs <key-file> <expected-address>
import { readFileSync } from "node:fs";
import { privateKeyToAccount } from "viem/accounts";

const [keyFile, expectedAddress] = process.argv.slice(2);
if (!keyFile || !expectedAddress) {
  throw new Error("Usage: node verify-local-key.mjs <key-file> <expected-address>");
}

const raw = readFileSync(keyFile, "utf8").trim();
const normalized = raw.startsWith("0x") ? raw : `0x${raw}`;

console.log(`Key file length (hex chars, excluding 0x): ${normalized.length - 2}`);

let account;
try {
  account = privateKeyToAccount(normalized);
} catch (err) {
  console.log(`INVALID KEY -- does not parse as a valid private key: ${err.message}`);
  process.exit(1);
}

console.log(`Derived address: ${account.address}`);
console.log(
  account.address.toLowerCase() === expectedAddress.toLowerCase()
    ? "MATCH -- this key is correct for that address."
    : "MISMATCH -- this key does NOT correspond to the expected address.",
);
