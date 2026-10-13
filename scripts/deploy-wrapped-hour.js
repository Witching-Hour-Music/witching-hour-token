import "dotenv/config";
import { network } from "hardhat";

// Same signer set/threshold as HourBridgeVault -- see
// deploy-bridge-vault.js and hOUR-Chain docs/ADR-0007-hour-token-bridge.md.
const BRIDGE_SIGNERS = [
  "0x565aa09A395dFA73132A09327E2D824EE9B527a1", // hour-bridge-signer-1
  "0xf32efbCfF73cF0fD1950c514d68d551188d54795", // hour-bridge-signer-2
  "0x1e3099CdACFC8ecF0Dda292436bf4e64A71Fa273", // hour-bridge-signer-3
];
const THRESHOLD = 2n;

async function main() {
  const { ethers } = await network.connect("hourchain");

  const [deployer] = await ethers.getSigners();
  console.log("Deploying WrappedHour to hOUR Chain...");
  console.log("Deployer:", deployer.address);
  console.log("Signers:", BRIDGE_SIGNERS);
  console.log("Threshold:", THRESHOLD.toString());

  const wrapped = await ethers.deployContract("WrappedHour", [
    BRIDGE_SIGNERS,
    THRESHOLD,
  ]);
  await wrapped.waitForDeployment();

  console.log("WrappedHour deployed to:", await wrapped.getAddress());
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
