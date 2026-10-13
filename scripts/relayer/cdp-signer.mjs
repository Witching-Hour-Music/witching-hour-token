// CDP server-wallet signer as a viem account. Signing happens inside CDP
// using the account's CDP-managed key; the private key never leaves CDP and
// is never read or printed by this script. Mirrors the pattern used by
// whm-onchain-agent's src/cdp-signer.mjs.
//
// Credential resolution order:
//   1. CDP_API_KEY_FILE + CDP_WALLET_SECRET_FILE env vars, if both are set
//      (explicit key files, same convention as whm-onchain-agent).
//   2. Otherwise, the CDP CLI's own logged-in config (~/.config/cdp), which
//      this machine already has active -- no extra setup needed.
import { existsSync, readFileSync } from "node:fs";
import { CdpClient } from "@coinbase/cdp-sdk";
import { toAccount } from "viem/accounts";

// Bridge signer accounts for the HOUR <-> hOUR Chain bridge. See
// hOUR-Chain docs/ADR-0007-hour-token-bridge.md. All three currently sit
// under the same CDP project/API key, so "signer-1" is the only one this
// relayer auto-confirms with -- the remaining confirmation needed to reach
// threshold must come from a manual run of manual-confirm.mjs.
export const BRIDGE_SIGNERS = {
  "hour-bridge-signer-1": "0x565aa09A395dFA73132A09327E2D824EE9B527a1",
  "hour-bridge-signer-2": "0xf32efbCfF73cF0fD1950c514d68d551188d54795",
  "hour-bridge-signer-3": "0x1e3099CdACFC8ecF0Dda292436bf4e64A71Fa273",
};

export const AUTO_SIGNER_NAME = "hour-bridge-signer-1";

function buildCdpClient() {
  const apiKeyFile = process.env.CDP_API_KEY_FILE;
  const walletSecretFile = process.env.CDP_WALLET_SECRET_FILE;

  if (apiKeyFile && walletSecretFile) {
    if (!existsSync(apiKeyFile)) {
      throw new Error(`CDP_API_KEY_FILE does not exist: ${apiKeyFile}`);
    }
    if (!existsSync(walletSecretFile)) {
      throw new Error(`CDP_WALLET_SECRET_FILE does not exist: ${walletSecretFile}`);
    }
    const apiKey = JSON.parse(readFileSync(apiKeyFile, "utf8"));
    return new CdpClient({
      apiKeyId: apiKey.id ?? apiKey.apiKeyId ?? apiKey.name,
      apiKeySecret: apiKey.privateKey ?? apiKey.apiKeySecret ?? apiKey.secret,
      walletSecret: readFileSync(walletSecretFile, "utf8").trim(),
    });
  }

  // Falls back to the CDP CLI's own active login.
  return new CdpClient();
}

/** @returns a viem Account whose signing is delegated to CDP by address. */
export async function loadCdpAccount(address) {
  const cdp = buildCdpClient();
  const account = await cdp.evm.getAccount({ address });
  if (account.address.toLowerCase() !== address.toLowerCase()) {
    throw new Error(`CDP returned ${account.address}, expected ${address}.`);
  }
  return toAccount(account);
}

/** Resolve a signer by its CDP account name (see BRIDGE_SIGNERS above). */
export async function loadCdpAccountByName(name) {
  const address = BRIDGE_SIGNERS[name];
  if (!address) {
    throw new Error(
      `Unknown bridge signer name "${name}". Known: ${Object.keys(BRIDGE_SIGNERS).join(", ")}`,
    );
  }
  return loadCdpAccount(address);
}
