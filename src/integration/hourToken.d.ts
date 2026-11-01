import type { Abi } from "viem";

export declare const HOUR_TOKEN_ADDRESS: `0x${string}`;

export declare const HOUR_TOKEN_CHAIN: {
  readonly id: 8453;
  readonly name: "Base";
  readonly nativeCurrency: {
    readonly name: "Ether";
    readonly symbol: "ETH";
    readonly decimals: 18;
  };
  readonly rpcUrl: "https://mainnet.base.org";
  readonly blockExplorerUrl: "https://basescan.org";
};

export declare const HOUR_TOKEN_METADATA: {
  readonly name: "Witching Hour";
  readonly symbol: "hOUR";
  readonly decimals: 18;
  readonly owner: `0x${string}`;
  readonly liquidityWallet: `0x${string}`;
  readonly rewardWallet: `0x${string}`;
};

export declare const HOUR_TOKEN_ABI: Abi;

/** Reviewable support intent only; never signs or submits a transfer. */
export declare function createSocialFiSupportIntent(args: {
  eventId: string; workId: string; recipient: string; amountAtomic: string;
}): {
  kind: string; version: number; eventId: string; workId: string; chainId: number;
  token: string; recipient: string; amountAtomic: string; state: string;
  requiresVerifiedWalletBinding: boolean; requiresApproval: boolean;
  simulateFirst: boolean; transactionSubmitted: boolean;
};
