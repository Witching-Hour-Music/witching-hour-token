// Minimal ABIs -- only the events/functions the relayer actually uses.
export const HOUR_BRIDGE_VAULT_ABI = [
  {
    type: "event",
    name: "Locked",
    inputs: [
      { name: "lockId", type: "bytes32", indexed: true },
      { name: "from", type: "address", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
      { name: "destAddr", type: "string", indexed: false },
    ],
  },
  {
    type: "function",
    name: "confirmRelease",
    stateMutability: "nonpayable",
    inputs: [
      { name: "releaseId", type: "bytes32" },
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "hasConfirmed",
    stateMutability: "view",
    inputs: [
      { name: "", type: "bytes32" },
      { name: "", type: "address" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "function",
    name: "releases",
    stateMutability: "view",
    inputs: [{ name: "", type: "bytes32" }],
    outputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
      { name: "confirmations", type: "uint256" },
      { name: "processed", type: "bool" },
    ],
  },
];

export const WRAPPED_HOUR_ABI = [
  {
    type: "event",
    name: "BurnedForRelease",
    inputs: [
      { name: "burnId", type: "bytes32", indexed: true },
      { name: "from", type: "address", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
      { name: "destAddr", type: "string", indexed: false },
    ],
  },
  {
    type: "function",
    name: "confirmMint",
    stateMutability: "nonpayable",
    inputs: [
      { name: "lockId", type: "bytes32" },
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "hasConfirmed",
    stateMutability: "view",
    inputs: [
      { name: "", type: "bytes32" },
      { name: "", type: "address" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "function",
    name: "mints",
    stateMutability: "view",
    inputs: [{ name: "", type: "bytes32" }],
    outputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
      { name: "confirmations", type: "uint256" },
      { name: "processed", type: "bool" },
    ],
  },
];
