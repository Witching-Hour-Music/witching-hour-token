import "dotenv/config";
import { network } from "hardhat";
import { BRIDGE_SIGNERS, requireReviewedBridgeSignerCustody } from "./relayer/cdp-signer.mjs";

const THRESHOLD = 2n;

async function main() {
  requireReviewedBridgeSignerCustody();
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
