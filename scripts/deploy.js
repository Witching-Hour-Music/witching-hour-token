import "dotenv/config";
import { network } from "hardhat";

async function main() {
  const { ethers } = await network.connect();

  const liquidityWallet = process.env.LIQUIDITY_WALLET;
  const rewardWallet = process.env.REWARD_WALLET;

  if (!liquidityWallet || !rewardWallet) {
    throw new Error("Missing wallet addresses in .env");
  }

  const [deployer] = await ethers.getSigners();

  console.log("Deploying Witching Hour token...");
  console.log("Deployer:", deployer.address);

  const token = await ethers.deployContract("HourToken", [
    liquidityWallet,
    rewardWallet,
  ]);

  await token.waitForDeployment();

  console.log("hOUR token deployed to:", await token.getAddress());
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
