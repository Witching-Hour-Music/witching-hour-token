// ONE-SHOT, TEST-ONLY script: proves the full lock -> relay -> mint cycle
// for free, using Base Sepolia (not mainnet) and the real hOUR Chain
// devnet. Deploys TestHour20 + HourBridgeVault to Base Sepolia (signed by
// hour-bridge-signer-1 via CDP, funded from the CDP testnet faucet), locks
// a test amount, auto-confirms the mint on hOUR Chain as signer-1, then
// manually confirms as signer-2 to cross the 2-of-3 threshold and mint
// whOUR. Not meant to be reused for a real deployment -- see
// deploy-bridge-vault.js / deploy-wrapped-hour.js for that.
import "dotenv/config";
import {
  createPublicClient,
  createWalletClient,
  http,
  parseEther,
  getContract,
  encodeDeployData,
  getContractAddress,
  pad,
  toHex,
} from "viem";
import { baseSepolia } from "viem/chains";

// CDP's sign-transaction endpoint can't sign a contract-CREATE transaction
// (empty `to`). Route deployments through the standard CREATE2 deployer
// proxy singleton instead, which is just a regular call (to=proxy,
// data=salt+initcode) -- a format CDP signs fine.
const CREATE2_DEPLOYER = "0x4e59b44847b379578588920cA78FbF26c0B4956C";
const ZERO_SALT = pad(toHex(0), { size: 32 });

async function deployViaCreate2({ publicClient, walletClient, abi, bytecode, args, account }) {
  const initcode = encodeDeployData({ abi, bytecode, args });
  const address = getContractAddress({
    bytecode: initcode,
    from: CREATE2_DEPLOYER,
    opcode: "CREATE2",
    salt: ZERO_SALT,
  });

  const existing = await publicClient.getBytecode({ address });
  if (existing && existing !== "0x") {
    console.log(`   (already deployed at this salt: ${address})`);
    return address;
  }

  const hash = await walletClient.sendTransaction({
    account,
    to: CREATE2_DEPLOYER,
    data: `${ZERO_SALT}${initcode.slice(2)}`,
  });
  await publicClient.waitForTransactionReceipt({ hash });
  return address;
}
import { readFileSync } from "node:fs";
import { loadCdpAccountByName, BRIDGE_SIGNERS } from "./cdp-signer.mjs";
import { WRAPPED_HOUR_ABI } from "./abis.mjs";

const HOURCHAIN_RPC_URL = process.env.HOURCHAIN_RPC_URL || "http://45.55.55.122:8545";
const WRAPPED_HOUR_ADDRESS = process.env.WRAPPED_HOUR_ADDRESS;
const BASE_SEPOLIA_RPC_URL = process.env.BASE_SEPOLIA_RPC_URL || "https://sepolia.base.org";

const hourChain = {
  id: 9000,
  name: "hOUR Chain devnet",
  nativeCurrency: { name: "ahbc", symbol: "HBC", decimals: 18 },
  rpcUrls: { default: { http: [HOURCHAIN_RPC_URL] } },
};

function loadArtifact(relPath) {
  const json = JSON.parse(readFileSync(new URL(relPath, import.meta.url), "utf8"));
  return { abi: json.abi, bytecode: json.bytecode };
}

async function main() {
  if (!WRAPPED_HOUR_ADDRESS) throw new Error("Missing WRAPPED_HOUR_ADDRESS in .env");

  const testHour = loadArtifact("../../artifacts/contracts/test/TestHour20.sol/TestHour20.json");
  const vaultArtifact = loadArtifact("../../artifacts/contracts/HourBridgeVault.sol/HourBridgeVault.json");

  const account = await loadCdpAccountByName("hour-bridge-signer-1");
  const baseSepoliaPublic = createPublicClient({ chain: baseSepolia, transport: http(BASE_SEPOLIA_RPC_URL) });
  const baseSepoliaWallet = createWalletClient({ account, chain: baseSepolia, transport: http(BASE_SEPOLIA_RPC_URL) });

  console.log(`Deployer / signer-1: ${account.address}`);
  const ethBalance = await baseSepoliaPublic.getBalance({ address: account.address });
  console.log(`Base Sepolia ETH balance: ${ethBalance}`);

  console.log("\n1. Deploying TestHour20 (via CREATE2 deployer proxy)...");
  const testHourAddress = await deployViaCreate2({
    publicClient: baseSepoliaPublic,
    walletClient: baseSepoliaWallet,
    abi: testHour.abi,
    bytecode: testHour.bytecode,
    args: [account.address, parseEther("1000000")],
    account,
  });
  console.log(`   TestHour20 deployed: ${testHourAddress}`);

  console.log("\n2. Deploying HourBridgeVault (via CREATE2 deployer proxy)...");
  const signers = Object.values(BRIDGE_SIGNERS);
  const vaultAddress = await deployViaCreate2({
    publicClient: baseSepoliaPublic,
    walletClient: baseSepoliaWallet,
    abi: vaultArtifact.abi,
    bytecode: vaultArtifact.bytecode,
    args: [testHourAddress, signers, 2n],
    account,
  });
  console.log(`   HourBridgeVault deployed: ${vaultAddress}`);

  const testHourContract = getContract({ address: testHourAddress, abi: testHour.abi, client: { public: baseSepoliaPublic, wallet: baseSepoliaWallet } });
  const vaultContract = getContract({ address: vaultAddress, abi: vaultArtifact.abi, client: { public: baseSepoliaPublic, wallet: baseSepoliaWallet } });

  const lockAmount = parseEther("100");
  const destAddr = account.address; // reuse the same address as the hOUR Chain recipient for this test

  console.log(`\n3. Approving vault for ${lockAmount} tHOUR...`);
  await baseSepoliaPublic.waitForTransactionReceipt({
    hash: await testHourContract.write.approve([vaultAddress, lockAmount]),
  });

  // Base Sepolia's public RPC is load-balanced across multiple backend
  // nodes; a read immediately after a receipted write can land on a node
  // that hasn't caught up yet. Poll until the allowance is actually
  // visible rather than assuming the receipt means every node sees it.
  for (let attempt = 0; attempt < 10; attempt++) {
    const allowance = await testHourContract.read.allowance([account.address, vaultAddress]);
    if (allowance >= lockAmount) break;
    if (attempt === 9) throw new Error("Allowance did not propagate after approve; aborting.");
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }

  console.log(`4. Locking ${lockAmount} tHOUR, destAddr=${destAddr}...`);
  const lockHash = await vaultContract.write.lock([lockAmount, destAddr]);
  const lockReceipt = await baseSepoliaPublic.waitForTransactionReceipt({ hash: lockHash });
  const lockedLog = lockReceipt.logs.find((l) => l.address.toLowerCase() === vaultAddress.toLowerCase());
  console.log(`   Locked tx: ${lockHash}`);

  // Re-derive the lock event rather than relying on raw log parsing order.
  // Same load-balanced-RPC lag as the allowance read above: retry until
  // whichever backend answers has caught up to the receipted block.
  let lockedEvents = [];
  for (let attempt = 0; attempt < 10; attempt++) {
    try {
      lockedEvents = await baseSepoliaPublic.getContractEvents({
        address: vaultAddress,
        abi: vaultArtifact.abi,
        eventName: "Locked",
        fromBlock: lockReceipt.blockNumber,
        toBlock: lockReceipt.blockNumber,
      });
      if (lockedEvents.length > 0) break;
    } catch {
      // ignore and retry
    }
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  if (lockedEvents.length === 0) throw new Error("Could not find Locked event after retries.");
  const lockId = lockedEvents[0].args.lockId;
  console.log(`   lockId: ${lockId}`);

  const hourChainPublic = createPublicClient({ chain: hourChain, transport: http(HOURCHAIN_RPC_URL) });

  // hOUR Chain's eth_estimateGas under-estimates (observed returning ~24k,
  // barely above the 21k tx base cost) -- set an explicit limit rather
  // than trusting auto-estimation on this chain.
  const HOURCHAIN_CONFIRM_GAS = 300_000n;

  console.log("\n5. Auto-confirming mint on hOUR Chain as signer-1...");
  const hourChainWallet = createWalletClient({ account, chain: hourChain, transport: http(HOURCHAIN_RPC_URL) });
  const confirm1Hash = await hourChainWallet.writeContract({
    address: WRAPPED_HOUR_ADDRESS,
    abi: WRAPPED_HOUR_ABI,
    functionName: "confirmMint",
    args: [lockId, destAddr, lockAmount],
    gas: HOURCHAIN_CONFIRM_GAS,
  });
  console.log(`   signer-1 confirmMint tx: ${confirm1Hash}`);
  const confirm1Receipt = await hourChainPublic.waitForTransactionReceipt({ hash: confirm1Hash });
  if (confirm1Receipt.status !== "success") {
    throw new Error(`signer-1 confirmMint REVERTED (status: ${confirm1Receipt.status})`);
  }

  console.log("6. Manually confirming mint as signer-2 (crosses 2-of-3 threshold)...");
  const signer2 = await loadCdpAccountByName("hour-bridge-signer-2");
  const hourChainWallet2 = createWalletClient({ account: signer2, chain: hourChain, transport: http(HOURCHAIN_RPC_URL) });
  const confirm2Hash = await hourChainWallet2.writeContract({
    address: WRAPPED_HOUR_ADDRESS,
    abi: WRAPPED_HOUR_ABI,
    functionName: "confirmMint",
    args: [lockId, destAddr, lockAmount],
    gas: HOURCHAIN_CONFIRM_GAS,
  });
  console.log(`   signer-2 confirmMint tx: ${confirm2Hash}`);
  const confirm2Receipt = await hourChainPublic.waitForTransactionReceipt({ hash: confirm2Hash });
  if (confirm2Receipt.status !== "success") {
    throw new Error(`signer-2 confirmMint REVERTED (status: ${confirm2Receipt.status})`);
  }

  console.log("\n7. Checking whOUR balance on hOUR Chain...");
  const balance = await hourChainPublic.readContract({
    address: WRAPPED_HOUR_ADDRESS,
    abi: [
      {
        type: "function",
        name: "balanceOf",
        stateMutability: "view",
        inputs: [{ name: "", type: "address" }],
        outputs: [{ name: "", type: "uint256" }],
      },
    ],
    functionName: "balanceOf",
    args: [destAddr],
  });

  console.log(`\n   whOUR balance for ${destAddr}: ${balance}`);
  console.log(balance === lockAmount ? "\nEND-TO-END CYCLE PROVED." : "\nMISMATCH -- balance does not equal locked amount.");

  console.log("\nTestnet contract addresses (Base Sepolia, NOT mainnet):");
  console.log(`  TestHour20:      ${testHourAddress}`);
  console.log(`  HourBridgeVault: ${vaultAddress}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
