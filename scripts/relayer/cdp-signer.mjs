// CDP-backed viem account that shells out to the already-authenticated
// `cdp` CLI for every signature. The private key never leaves CDP, is
// never read, and is never printed by this script -- not even via
// environment variables. This also sidesteps the @coinbase/cdp-sdk
// package's separate (and, on this machine, unconfigured)
// CDP_API_KEY_ID/CDP_API_KEY_SECRET/CDP_WALLET_SECRET env vars: the `cdp`
// CLI has its own working login (~/.config/cdp), so we reuse that instead.
//
// Because signing goes through `cdp evm accounts sign transaction`, which
// is network-agnostic (it signs an RLP-encoded EIP-1559 transaction
// without knowing or caring what chain it's for), this account works
// identically against Base, Base Sepolia, or hOUR Chain's custom chain id
// 9000 -- viem's walletClient fills in nonce/gas/fees via the configured
// RPC, asks this account to sign, then broadcasts via eth_sendRawTransaction
// itself. No CDP "send transaction" network allowlist applies.
import { execFileSync } from "node:child_process";
import { serializeTransaction } from "viem";
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

function cdpCliSignTransaction(address, serializedUnsignedTx) {
  const out = execFileSync(
    "cdp",
    ["evm", "accounts", "sign", "transaction", address, `transaction=${serializedUnsignedTx}`],
    { encoding: "utf8" },
  );
  const { signedTransaction } = JSON.parse(out);
  return signedTransaction;
}

/** @returns a viem Account whose signing is delegated to the CDP CLI. */
export function loadCdpAccount(address) {
  return toAccount({
    address,
    async signTransaction(transaction) {
      const unsigned = serializeTransaction(transaction);
      return cdpCliSignTransaction(address, unsigned);
    },
    async signMessage() {
      throw new Error("signMessage is not needed by the bridge relayer and is not implemented.");
    },
    async signTypedData() {
      throw new Error("signTypedData is not needed by the bridge relayer and is not implemented.");
    },
  });
}

/** Resolve a signer by its CDP account name (see BRIDGE_SIGNERS above). */
export function loadCdpAccountByName(name) {
  const address = BRIDGE_SIGNERS[name];
  if (!address) {
    throw new Error(
      `Unknown bridge signer name "${name}". Known: ${Object.keys(BRIDGE_SIGNERS).join(", ")}`,
    );
  }
  return loadCdpAccount(address);
}
