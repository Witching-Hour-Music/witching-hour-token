// Manual second confirmation for the hOUR bridge. Use this to supply the
// confirmation the relayer deliberately does NOT automate -- see
// hOUR-Chain docs/ADR-0007-hour-token-bridge.md. Always verify the
// underlying lock/burn event yourself before running this; the point of a
// manual step is that you look, not that you rubber-stamp whatever the
// relayer printed.
//
// Usage:
//   node scripts/relayer/manual-confirm.mjs mint lockId=0x.. to=0x.. amount=1000 --signer=hour-bridge-signer-2
//   node scripts/relayer/manual-confirm.mjs release releaseId=0x.. to=0x.. amount=1000 --signer=hour-bridge-signer-3
import "dotenv/config";
import { createWalletClient, http } from "viem";
import { base } from "viem/chains";
import { loadCdpAccountByName, BRIDGE_SIGNERS } from "./cdp-signer.mjs";
import { HOUR_BRIDGE_VAULT_ABI, WRAPPED_HOUR_ABI } from "./abis.mjs";

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

  for (const arg of rest) {
    if (arg.startsWith("--signer=")) {
      signer = arg.slice("--signer=".length);
      continue;
    }
    const [key, value] = arg.split("=");
    if (key && value !== undefined) fields[key] = value;
  }

  return { kind, fields, signer };
}

async function main() {
  const { kind, fields, signer } = parseArgs(process.argv.slice(2));

  if (kind !== "mint" && kind !== "release") {
    throw new Error('First argument must be "mint" or "release"');
  }
  if (!signer || !BRIDGE_SIGNERS[signer]) {
    throw new Error(
      `--signer=<name> is required and must be one of: ${Object.keys(BRIDGE_SIGNERS).join(", ")}`,
    );
  }
  if (!fields.to || fields.amount === undefined) {
    throw new Error("Both to=0x.. and amount=<uint> are required");
  }

  const account = await loadCdpAccountByName(signer);

  if (kind === "mint") {
    const lockId = fields.lockId;
    if (!lockId) throw new Error("lockId=0x.. is required for mint");

    const walletClient = createWalletClient({ account, chain: hourChain, transport: http(HOURCHAIN_RPC_URL) });
    console.log(`Confirming mint lockId=${lockId} to=${fields.to} amount=${fields.amount} as ${signer}`);
    const hash = await walletClient.writeContract({
      address: process.env.WRAPPED_HOUR_ADDRESS,
      abi: WRAPPED_HOUR_ABI,
      functionName: "confirmMint",
      args: [lockId, fields.to, BigInt(fields.amount)],
    });
    console.log(`tx sent: ${hash}`);
    return;
  }

  const releaseId = fields.releaseId;
  if (!releaseId) throw new Error("releaseId=0x.. is required for release");

  const walletClient = createWalletClient({ account, chain: base, transport: http(BASE_RPC_URL) });
  console.log(`Confirming release releaseId=${releaseId} to=${fields.to} amount=${fields.amount} as ${signer}`);
  const hash = await walletClient.writeContract({
    address: process.env.HOUR_BRIDGE_VAULT_ADDRESS,
    abi: HOUR_BRIDGE_VAULT_ABI,
    functionName: "confirmRelease",
    args: [releaseId, fields.to, BigInt(fields.amount)],
  });
  console.log(`tx sent: ${hash}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
