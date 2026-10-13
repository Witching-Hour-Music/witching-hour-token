// Run this YOURSELF -- do not have an agent run it. It exports a bridge
// signer's private key out of CDP custody, for independent (non-CDP)
// storage. The plaintext key only ever exists in memory here and in the
// output file; it is never printed to the terminal and never sent
// anywhere except the one local file you specify.
//
// Usage:
//   node scripts/relayer/export-signer-key.mjs <address> <output-file>
//
// Example:
//   node scripts/relayer/export-signer-key.mjs 0x1e3099CdACFC8ecF0Dda292436bf4e64A71Fa273 /path/outside/this/repo/signer3.key
//
// After this succeeds:
//   1. Move the output file to its real secure home (hardware wallet
//      import, password manager, offline backup) immediately.
//   2. Delete it from wherever it was first written.
//   3. Consider whether to also remove/rotate the account on the CDP
//      side, since CDP can still sign with it until you do.
import { execFileSync } from "node:child_process";
import { generateKeyPair, privateDecrypt, constants, createPrivateKey } from "node:crypto";
import { writeFileSync, existsSync } from "node:fs";

function generateExportEncryptionKeyPair() {
  return new Promise((resolve, reject) => {
    generateKeyPair(
      "rsa",
      {
        modulusLength: 4096,
        publicKeyEncoding: { type: "spki", format: "der" },
        privateKeyEncoding: { type: "pkcs1", format: "der" },
      },
      (err, publicKey, privateKey) => {
        if (err) return reject(err);
        resolve({ publicKey: publicKey.toString("base64"), privateKey: privateKey.toString("base64") });
      },
    );
  });
}

function decryptWithPrivateKey(b64PrivateKey, b64Cipher) {
  const privateKey = createPrivateKey({
    key: Buffer.from(b64PrivateKey, "base64"),
    format: "der",
    type: "pkcs1",
  });
  const decrypted = privateDecrypt(
    { key: privateKey, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: "sha256" },
    Buffer.from(b64Cipher, "base64"),
  );
  return decrypted.toString("hex");
}

async function main() {
  const [address, outputFile] = process.argv.slice(2);
  if (!address || !outputFile) {
    throw new Error("Usage: node export-signer-key.mjs <address> <output-file>");
  }
  if (existsSync(outputFile)) {
    throw new Error(`${outputFile} already exists -- refusing to overwrite. Choose a new path.`);
  }

  console.log("Generating a one-time RSA-4096 export key pair (stays in memory only)...");
  const { publicKey, privateKey } = await generateExportEncryptionKeyPair();

  console.log(`Requesting encrypted export for ${address} via the cdp CLI...`);
  const out = execFileSync(
    "cdp",
    ["evm", "accounts", "export", address, `exportEncryptionKey=${publicKey}`],
    { encoding: "utf8" },
  );
  const { encryptedPrivateKey } = JSON.parse(out);

  console.log("Decrypting locally...");
  const rawPrivateKeyHex = decryptWithPrivateKey(privateKey, encryptedPrivateKey);

  writeFileSync(outputFile, `0x${rawPrivateKeyHex}\n`, { mode: 0o600 });
  console.log(`\nWrote the private key to ${outputFile} (never printed here).`);
  console.log("Move it to secure storage now, then delete this file.");
}

main().catch((err) => {
  console.error(err.message || err);
  process.exitCode = 1;
});
