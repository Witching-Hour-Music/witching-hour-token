import "dotenv/config";
import { network } from "hardhat";

// Signer set for the HOUR <-> hOUR Chain bridge (see hOUR-Chain
// docs/ADR-0007-hour-token-bridge.md). All three are CDP-managed accounts
// under the same CDP project today, so the on-chain 2-of-3 threshold does
// not yet provide independent-custody security -- see ADR-0007's trust-
// model note. Do not raise automation beyond 1-of-3 auto-confirmed signers
// until these keys live under separate custody.
const BRIDGE_SIGNERS = [
  "0x565aa09A395dFA73132A09327E2D824EE9B527a1", // hour-bridge-signer-1
  "0xf32efbCfF73cF0fD1950c514d68d551188d54795", // hour-bridge-signer-2
  "0x1e3099CdACFC8ecF0Dda292436bf4e64A71Fa273", // hour-bridge-signer-3
];
const THRESHOLD = 2n;

async function main() {
  const { ethers } = await network.connect();

  const hourToken = process.env.TOKEN_ADDRESS;
  if (!hourToken) {
    throw new Error("Missing TOKEN_ADDRESS in .env");
  }
  const bridgeAdmin = process.env.BASE_BRIDGE_ADMIN;
  if (!bridgeAdmin) {
    throw new Error("Missing BASE_BRIDGE_ADMIN multisig contract address in .env");
  }
  if ((await ethers.provider.getCode(bridgeAdmin)) === "0x") {
    throw new Error("BRIDGE_ADMIN must be a deployed multisig contract");
  }
  const safeAdmin = new ethers.Contract(bridgeAdmin, [
    "function getOwners() view returns (address[])",
    "function getThreshold() view returns (uint256)",
  ], ethers.provider);
  const [safeOwners, safeThreshold] = await Promise.all([
    safeAdmin.getOwners(),
    safeAdmin.getThreshold(),
  ]);
  if (safeOwners.length < 3 || safeThreshold < 2n) {
    throw new Error("BASE_BRIDGE_ADMIN must be a Safe with at least 3 owners and a 2+ threshold");
  }

  const [deployer] = await ethers.getSigners();
  console.log("Deploying HourBridgeVault...");
  console.log("Deployer:", deployer.address);
  console.log("HOUR token:", hourToken);
  console.log("Bridge admin multisig:", bridgeAdmin);
  console.log("Signers:", BRIDGE_SIGNERS);
  console.log("Threshold:", THRESHOLD.toString());

  const vault = await ethers.deployContract("HourBridgeVault", [
    hourToken,
    BRIDGE_SIGNERS,
    THRESHOLD,
    bridgeAdmin,
  ]);
  await vault.waitForDeployment();

  console.log("HourBridgeVault deployed to:", await vault.getAddress());
  console.log(
    "Next: call HourToken.setFeeExempt(vaultAddress, true) from the token owner.",
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
