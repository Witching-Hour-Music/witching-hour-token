import "dotenv/config";
import { network } from "hardhat";
import { BRIDGE_SIGNERS, requireReviewedBridgeSignerCustody } from "./relayer/cdp-signer.mjs";

const THRESHOLD = 2n;

async function main() {
  requireReviewedBridgeSignerCustody();
  const { ethers } = await network.connect("hourchain");
  const bridgeAdmin = process.env.HOURCHAIN_BRIDGE_ADMIN;
  if (!bridgeAdmin) {
    throw new Error("Missing HOURCHAIN_BRIDGE_ADMIN multisig contract address in .env");
  }
  if ((await ethers.provider.getCode(bridgeAdmin)) === "0x") {
    throw new Error("BRIDGE_ADMIN must be a deployed multisig contract on hOUR Chain");
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
    throw new Error("HOURCHAIN_BRIDGE_ADMIN must be a Safe with at least 3 owners and a 2+ threshold");
  }

  const [deployer] = await ethers.getSigners();
  console.log("Deploying WrappedHour to hOUR Chain...");
  console.log("Deployer:", deployer.address);
  console.log("Bridge admin multisig:", bridgeAdmin);
  console.log("Signers:", BRIDGE_SIGNERS);
  console.log("Threshold:", THRESHOLD.toString());

  const wrapped = await ethers.deployContract("WrappedHour", [
    BRIDGE_SIGNERS,
    THRESHOLD,
    bridgeAdmin,
  ]);
  await wrapped.waitForDeployment();

  console.log("WrappedHour deployed to:", await wrapped.getAddress());
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
