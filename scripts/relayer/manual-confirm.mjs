// Manual second confirmation for the hOUR bridge. Use this to supply the
// confirmation the relayer deliberately does NOT automate -- see
// hOUR-Chain docs/ADR-0007-hour-token-bridge.md. Always verify the
// underlying lock/burn event yourself before running this; the point of a
// manual step is that you look, not that you rubber-stamp whatever the
// relayer printed.
//
// Usage (CDP-backed signer):
//   node scripts/relayer/manual-confirm.mjs mint lockId=0x.. to=0x.. amount=1000 --signer=hour-bridge-signer-2
//   node scripts/relayer/manual-confirm.mjs release releaseId=0x.. to=0x.. amount=1000 --signer=hour-bridge-signer-3
//
// Usage (independently-held key, e.g. an exported/separated signer -- see
// scripts/relayer/export-signer-key.mjs and ADR-0007's custody note):
//   node scripts/relayer/manual-confirm.mjs mint lockId=0x.. to=0x.. amount=1000 --local-key-file=/secure/path/signer3.key
import "dotenv/config";
import { readFileSync } from "node:fs";
import { createPublicClient, createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base } from "viem/chains";
import { loadCdpAccountByName, BRIDGE_SIGNERS } from "./cdp-signer.mjs";
import { HOUR_BRIDGE_VAULT_ABI, WRAPPED_HOUR_ABI } from "./abis.mjs";

async function assertSucceeded(publicClient, hash, label) {
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") {
    throw new Error(`${label} reverted on-chain (tx ${hash}, status: ${receipt.status})`);
  }
  console.log(`${label} confirmed on-chain (block ${receipt.blockNumber})`);
}

const HOURCHAIN_RPC_URL = process.env.HOURCHAIN_RPC_URL || "http://45.55.55.122:8545";
const BASE_RPC_URL = process.env.BASE_RPC_URL || "https://mainnet.base.org";
const hourChain = {
  id: 9000,
  name: "hOUR Chain devnet",
  nativeCurrency: { name: "ahbc", symbol: "HBC", decimals: 18 },
  rpcUrls: { default: { http: [HOURCHAIN_RPC_URL] } },
};

function parseArgs(argv) {
  const [kind, ...rest] = argv;
  const fields = {};
  let signer;
  let localKeyFile;

  for (const arg of rest) {
    if (arg.startsWith("--signer=")) {
      signer = arg.slice("--signer=".length);
      continue;
    }
    if (arg.startsWith("--local-key-file=")) {
      localKeyFile = arg.slice("--local-key-file=".length);
      continue;
    }
    const [key, value] = arg.split("=");
    if (key && value !== undefined) fields[key] = value;
  }

  return { kind, fields, signer, localKeyFile };
}

async function main() {
  const { kind, fields, signer, localKeyFile } = parseArgs(process.argv.slice(2));

  if (kind !== "mint" && kind !== "release") {
    throw new Error('First argument must be "mint" or "release"');
  }
  if (!signer && !localKeyFile) {
    throw new Error(
      `Either --signer=<name> (one of: ${Object.keys(BRIDGE_SIGNERS).join(", ")}) or --local-key-file=<path> is required`,
    );
  }
  if (signer && localKeyFile) {
    throw new Error("Pass only one of --signer or --local-key-file, not both");
  }
  if (signer && !BRIDGE_SIGNERS[signer]) {
    throw new Error(`Unknown --signer "${signer}". Known: ${Object.keys(BRIDGE_SIGNERS).join(", ")}`);
  }
  if (!fields.to || fields.amount === undefined) {
    throw new Error("Both to=0x.. and amount=<uint> are required");
  }

  const account = localKeyFile
    ? privateKeyToAccount(readFileSync(localKeyFile, "utf8").trim())
    : await loadCdpAccountByName(signer);
  console.log(`Signing as ${account.address} (${localKeyFile ? "local key" : `CDP: ${signer}`})`);

  if (kind === "mint") {
    const lockId = fields.lockId;
    if (!lockId) throw new Error("lockId=0x.. is required for mint");

    const publicClient = createPublicClient({ chain: hourChain, transport: http(HOURCHAIN_RPC_URL) });
    const walletClient = createWalletClient({ account, chain: hourChain, transport: http(HOURCHAIN_RPC_URL) });
    console.log(`Confirming mint lockId=${lockId} to=${fields.to} amount=${fields.amount} as ${signer}`);
    const hash = await walletClient.writeContract({
      address: process.env.WRAPPED_HOUR_ADDRESS,
      abi: WRAPPED_HOUR_ABI,
      functionName: "confirmMint",
      args: [lockId, fields.to, BigInt(fields.amount)],
      // hOUR Chain's eth_estimateGas under-estimates (observed returning
      // ~24k, barely above the 21k tx base cost) -- set an explicit limit.
      gas: 300_000n,
    });
    console.log(`tx sent: ${hash}`);
    await assertSucceeded(publicClient, hash, "confirmMint");
    return;
  }

  const releaseId = fields.releaseId;
  if (!releaseId) throw new Error("releaseId=0x.. is required for release");

  const basePublicClient = createPublicClient({ chain: base, transport: http(BASE_RPC_URL) });
  const walletClient = createWalletClient({ account, chain: base, transport: http(BASE_RPC_URL) });
  console.log(`Confirming release releaseId=${releaseId} to=${fields.to} amount=${fields.amount} as ${signer}`);
  const hash = await walletClient.writeContract({
    address: process.env.HOUR_BRIDGE_VAULT_ADDRESS,
    abi: HOUR_BRIDGE_VAULT_ABI,
    functionName: "confirmRelease",
    args: [releaseId, fields.to, BigInt(fields.amount)],
  });
  console.log(`tx sent: ${hash}`);
  await assertSucceeded(basePublicClient, hash, "confirmRelease");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
