// Deploys HourBridgeVault to Base MAINNET, signed by the `treasury` CDP
// account via the `cdp` CLI (see scripts/relayer/cdp-signer.mjs). Routes
// the deployment through the standard CREATE2 deployer proxy singleton,
// since CDP's sign-transaction endpoint can't sign a contract-CREATE
// transaction (empty `to`) -- see hOUR-Chain
// docs/ADR-0007-hour-token-bridge.md.
//
// This spends real ETH gas from `treasury`. Run deliberately, not as part
// of any automated flow.
import { readFileSync } from "node:fs";
import {
  createPublicClient,
  createWalletClient,
  http,
  encodeDeployData,
  getContractAddress,
  pad,
  toHex,
} from "viem";
import { base } from "viem/chains";
import { loadCdpAccount, BRIDGE_SIGNERS } from "./relayer/cdp-signer.mjs";

const HOUR_TOKEN_ADDRESS = "0xFC1c0FFF99845676A588CE21c28C4859F3035866";
const TREASURY_ADDRESS = "0x736b1d28344e02A3CC3A680669BDDA3cf7Ec215c";
const CREATE2_DEPLOYER = "0x4e59b44847b379578588920cA78FbF26c0B4956C";
const ZERO_SALT = pad(toHex(0), { size: 32 });

function loadArtifact(relPath) {
  const json = JSON.parse(readFileSync(new URL(relPath, import.meta.url), "utf8"));
  return { abi: json.abi, bytecode: json.bytecode };
}

async function main() {
  const vaultArtifact = loadArtifact("../artifacts/contracts/HourBridgeVault.sol/HourBridgeVault.json");
  const account = loadCdpAccount(TREASURY_ADDRESS);
  const publicClient = createPublicClient({ chain: base, transport: http("https://mainnet.base.org") });
  const walletClient = createWalletClient({ account, chain: base, transport: http("https://mainnet.base.org") });

  const balance = await publicClient.getBalance({ address: account.address });
  console.log(`Deployer: ${account.address}`);
  console.log(`Balance:  ${balance} wei`);

  const signers = Object.values(BRIDGE_SIGNERS);
  const args = [HOUR_TOKEN_ADDRESS, signers, 2n];
  const initcode = encodeDeployData({ abi: vaultArtifact.abi, bytecode: vaultArtifact.bytecode, args });
  const vaultAddress = getContractAddress({
    bytecode: initcode,
    from: CREATE2_DEPLOYER,
    opcode: "CREATE2",
    salt: ZERO_SALT,
  });

  const existing = await publicClient.getBytecode({ address: vaultAddress });
  if (existing && existing !== "0x") {
    console.log(`Already deployed at this salt: ${vaultAddress}`);
    return;
  }

  console.log(`HOUR token:       ${HOUR_TOKEN_ADDRESS}`);
  console.log(`Signers:          ${signers.join(", ")}`);
  console.log(`Threshold:        2`);
  console.log(`Predicted address: ${vaultAddress}`);

  const gasEstimate = await publicClient.estimateGas({
    account: account.address,
    to: CREATE2_DEPLOYER,
    data: `${ZERO_SALT}${initcode.slice(2)}`,
  });
  console.log(`Gas estimate: ${gasEstimate}`);

  const hash = await walletClient.sendTransaction({
    account,
    to: CREATE2_DEPLOYER,
    data: `${ZERO_SALT}${initcode.slice(2)}`,
    gas: (gasEstimate * 120n) / 100n, // 20% buffer
  });
  console.log(`tx sent: ${hash}`);

  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") {
    throw new Error(`Deployment REVERTED (status: ${receipt.status})`);
  }

  console.log(`\nHourBridgeVault deployed to Base MAINNET: ${vaultAddress}`);
  console.log(`tx: https://basescan.org/tx/${hash}`);
  console.log(`\nNext step (must be run by the HourToken owner, 0x52864a2E...):`);
  console.log(`  HourToken.setFeeExempt(${vaultAddress}, true)`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
