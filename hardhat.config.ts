import { defineConfig } from "hardhat/config";
import hardhatToolboxMochaEthers from "@nomicfoundation/hardhat-toolbox-mocha-ethers";
import * as dotenv from "dotenv";

dotenv.config();

const privateKey = process.env.PRIVATE_KEY ?? "";
const accounts = /^0x[a-fA-F0-9]{64}$/.test(privateKey) ? [privateKey] : [];

// Separate key for hOUR Chain's devnet so a Base mainnet key is never reused
// against the EVM RPC exposed by the hourd devnet (see hOUR-Chain
// docs/ADR-0007-hour-token-bridge.md). Defaults to the "test" keyring dev0
// mnemonic-derived key used by hOUR-Chain's devnet.sh; override for a real
// signer before any non-devnet deployment.
const hourChainPrivateKey = process.env.HOURCHAIN_PRIVATE_KEY ?? "";
const hourChainAccounts = /^0x[a-fA-F0-9]{64}$/.test(hourChainPrivateKey)
  ? [hourChainPrivateKey]
  : [];

export default defineConfig({
  plugins: [hardhatToolboxMochaEthers],
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: { enabled: false, runs: 200 },
      evmVersion: "shanghai"
    }
  },
  networks: {
    base: {
      type: "http",
      chainType: "op",
      chainId: 8453,
      url: "https://mainnet.base.org",
      accounts
    },
    hourchain: {
      type: "http",
      chainType: "generic",
      chainId: 9000,
      url: process.env.HOURCHAIN_RPC_URL || "http://45.55.55.122:8545",
      accounts: hourChainAccounts
    }
  },
  verify: {
    etherscan: {
      apiKey: process.env.BASESCAN_API_KEY || ""
    }
  }
});
