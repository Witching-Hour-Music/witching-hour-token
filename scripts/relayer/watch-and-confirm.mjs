// hOUR bridge relayer: watches for Locked events on Base (HourBridgeVault)
// and BurnedForRelease events on hOUR Chain (WrappedHour), and auto-confirms
// each with exactly ONE signer (AUTO_SIGNER_NAME). Reaching the 2-of-3
// threshold still requires a second, manual confirmation -- run
// manual-confirm.mjs with a different signer. This is deliberate: see
// hOUR-Chain docs/ADR-0007-hour-token-bridge.md. Do not change this script
// to auto-confirm more than one signer without re-reading that ADR's
// trust-model note.
import "dotenv/config";
import { createPublicClient, createWalletClient, http, getAddress } from "viem";
import { base } from "viem/chains";
import { loadCdpAccountByName, AUTO_SIGNER_NAME } from "./cdp-signer.mjs";
import { HOUR_BRIDGE_VAULT_ABI, WRAPPED_HOUR_ABI } from "./abis.mjs";

const HOUR_BRIDGE_VAULT_ADDRESS = requireEnv("HOUR_BRIDGE_VAULT_ADDRESS");
const WRAPPED_HOUR_ADDRESS = requireEnv("WRAPPED_HOUR_ADDRESS");
const BASE_RPC_URL = process.env.BASE_RPC_URL || "https://mainnet.base.org";
const HOURCHAIN_RPC_URL = process.env.HOURCHAIN_RPC_URL || "http://45.55.55.122:8545";
const HOURCHAIN_CHAIN_ID = 9000;
const POLL_INTERVAL_MS = Number(process.env.RELAYER_POLL_INTERVAL_MS || 15_000);

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var ${name}`);
  }
  return value;
}

const hourChain = {
  id: HOURCHAIN_CHAIN_ID,
  name: "hOUR Chain devnet",
  nativeCurrency: { name: "ahbc", symbol: "HBC", decimals: 18 },
  rpcUrls: { default: { http: [HOURCHAIN_RPC_URL] } },
};

const baseClient = createPublicClient({ chain: base, transport: http(BASE_RPC_URL) });
const hourChainClient = createPublicClient({ chain: hourChain, transport: http(HOURCHAIN_RPC_URL) });

function manualCommandHint(kind, idLabel, id, to, amount) {
  console.log(
    [
      "",
      `  >>> Needs a second, manual confirmation to reach threshold (2-of-3).`,
      `  >>> Run as a different signer (hour-bridge-signer-2 or -3):`,
      `  node scripts/relayer/manual-confirm.mjs ${kind} ${idLabel}=${id} to=${to} amount=${amount} --signer=hour-bridge-signer-2`,
      "",
    ].join("\n"),
  );
}

async function autoConfirmMint(lockId, to, amount) {
  const signerAddress = (await loadCdpAccountByName(AUTO_SIGNER_NAME)).address;

  const already = await hourChainClient.readContract({
    address: WRAPPED_HOUR_ADDRESS,
    abi: WRAPPED_HOUR_ABI,
    functionName: "hasConfirmed",
    args: [lockId, signerAddress],
  });
  if (already) {
    console.log(`[mint] ${lockId} already confirmed by ${AUTO_SIGNER_NAME}, skipping.`);
    return;
  }

  const account = await loadCdpAccountByName(AUTO_SIGNER_NAME);
  const walletClient = createWalletClient({ account, chain: hourChain, transport: http(HOURCHAIN_RPC_URL) });

  console.log(`[mint] auto-confirming lockId=${lockId} to=${to} amount=${amount} as ${AUTO_SIGNER_NAME}`);
  const hash = await walletClient.writeContract({
    address: WRAPPED_HOUR_ADDRESS,
    abi: WRAPPED_HOUR_ABI,
    functionName: "confirmMint",
    args: [lockId, to, amount],
    // hOUR Chain's eth_estimateGas under-estimates (observed returning
    // ~24k, barely above the 21k tx base cost) -- set an explicit limit
    // rather than trusting auto-estimation on this chain.
    gas: 300_000n,
  });
  console.log(`[mint] tx sent: ${hash}`);
  const receipt = await hourChainClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") {
    console.error(`[mint] tx ${hash} REVERTED on-chain (status: ${receipt.status})`);
    return;
  }

  manualCommandHint("mint", "lockId", lockId, to, amount);
}

async function autoConfirmRelease(releaseId, to, amount) {
  const signerAddress = (await loadCdpAccountByName(AUTO_SIGNER_NAME)).address;

  const already = await baseClient.readContract({
    address: HOUR_BRIDGE_VAULT_ADDRESS,
    abi: HOUR_BRIDGE_VAULT_ABI,
    functionName: "hasConfirmed",
    args: [releaseId, signerAddress],
  });
  if (already) {
    console.log(`[release] ${releaseId} already confirmed by ${AUTO_SIGNER_NAME}, skipping.`);
    return;
  }

  const account = await loadCdpAccountByName(AUTO_SIGNER_NAME);
  const walletClient = createWalletClient({ account, chain: base, transport: http(BASE_RPC_URL) });

  console.log(`[release] auto-confirming releaseId=${releaseId} to=${to} amount=${amount} as ${AUTO_SIGNER_NAME}`);
  const hash = await walletClient.writeContract({
    address: HOUR_BRIDGE_VAULT_ADDRESS,
    abi: HOUR_BRIDGE_VAULT_ABI,
    functionName: "confirmRelease",
    args: [releaseId, to, amount],
  });
  console.log(`[release] tx sent: ${hash}`);
  const receipt = await baseClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") {
    console.error(`[release] tx ${hash} REVERTED on-chain (status: ${receipt.status})`);
    return;
  }

  manualCommandHint("release", "releaseId", releaseId, to, amount);
}

async function pollBaseLocks(fromBlock) {
  const latest = await baseClient.getBlockNumber();
  if (fromBlock > latest) return fromBlock;

  const logs = await baseClient.getContractEvents({
    address: HOUR_BRIDGE_VAULT_ADDRESS,
    abi: HOUR_BRIDGE_VAULT_ABI,
    eventName: "Locked",
    fromBlock,
    toBlock: latest,
  });

  for (const log of logs) {
    const { lockId, amount, destAddr } = log.args;
    let to;
    try {
      to = getAddress(destAddr);
    } catch {
      console.error(`[mint] skipping lockId=${lockId}: destAddr "${destAddr}" is not a valid address`);
      continue;
    }
    await autoConfirmMint(lockId, to, amount);
  }

  return latest + 1n;
}

async function pollHourChainBurns(fromBlock) {
  const latest = await hourChainClient.getBlockNumber();
  if (fromBlock > latest) return fromBlock;

  const logs = await hourChainClient.getContractEvents({
    address: WRAPPED_HOUR_ADDRESS,
    abi: WRAPPED_HOUR_ABI,
    eventName: "BurnedForRelease",
    fromBlock,
    toBlock: latest,
  });

  for (const log of logs) {
    const { burnId, amount, destAddr } = log.args;
    let to;
    try {
      to = getAddress(destAddr);
    } catch {
      console.error(`[release] skipping burnId=${burnId}: destAddr "${destAddr}" is not a valid address`);
      continue;
    }
    await autoConfirmRelease(burnId, to, amount);
  }

  return latest + 1n;
}

async function main() {
  console.log(`hOUR bridge relayer starting. Auto-confirming only as: ${AUTO_SIGNER_NAME}`);
  console.log(`Base vault:     ${HOUR_BRIDGE_VAULT_ADDRESS}`);
  console.log(`WrappedHour:    ${WRAPPED_HOUR_ADDRESS}`);
  console.log(`Poll interval:  ${POLL_INTERVAL_MS}ms`);

  let baseFromBlock = await baseClient.getBlockNumber();
  let hourChainFromBlock = await hourChainClient.getBlockNumber();

  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      baseFromBlock = await pollBaseLocks(baseFromBlock);
    } catch (err) {
      console.error("[mint] poll error:", err.message || err);
    }

    try {
      hourChainFromBlock = await pollHourChainBurns(hourChainFromBlock);
    } catch (err) {
      console.error("[release] poll error:", err.message || err);
    }

    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
