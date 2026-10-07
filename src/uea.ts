import {
  encodeAbiParameters,
  keccak256,
  getCreate2Address,
  getAddress,
  bytesToHex,
  hexToBytes,
  encodeFunctionData,
  decodeFunctionResult,
  type Address,
} from 'viem';
import bs58 from 'bs58';
import { ethCall } from './blockscout';
// We lean on the SDK's own authoritative constants (namespaces, chain ids, the
// UEA factory + proxy addresses) so this tool stays correct if Push updates
// them — but we deliberately deep-import only the constant modules, not the
// whole @pushchain/core graph, and compute the UEA fully offchain.
import { CHAIN, VM, PUSH_NETWORK } from '@pushchain/core/src/lib/constants/enums';
import {
  CHAIN_INFO,
  VM_NAMESPACE,
  UEA_PROXY,
  PUSH_CHAIN_INFO,
} from '@pushchain/core/src/lib/constants/chain';

export { CHAIN, VM };

const PUSH_CHAINS = new Set<CHAIN>([
  CHAIN.PUSH_MAINNET,
  CHAIN.PUSH_TESTNET_DONUT,
  CHAIN.PUSH_LOCALNET,
]);

export function isPushChain(chain: CHAIN): boolean {
  return PUSH_CHAINS.has(chain);
}

// This tool targets the Donut testnet only.
const FACTORY = PUSH_CHAIN_INFO[CHAIN.PUSH_TESTNET_DONUT].factoryAddress as Address;
const PROXY = UEA_PROXY[PUSH_NETWORK.TESTNET_DONUT] as string;

export interface ChainMeta {
  namespace: string;
  chainId: string;
  vm: VM;
}

export function chainMeta(chain: CHAIN): ChainMeta {
  const info = CHAIN_INFO[chain];
  return { namespace: VM_NAMESPACE[info.vm], chainId: info.chainId, vm: info.vm };
}

/** CAIP-10 chain-agnostic id, e.g. `eip155:11155111:0xabc…`. */
export function toCaip(chain: CHAIN, address: string): string {
  const { namespace, chainId } = chainMeta(chain);
  return `${namespace}:${chainId}:${address}`;
}

/**
 * Deterministically derive the Universal Executor Account (UEA) on Push Chain
 * for an origin account — fully offchain (CREATE2), no RPC, no key.
 *
 * This mirrors `computeUEAOffchain` in @pushchain/core exactly (verified against
 * live `UEADeployed` events on Donut), which lets the site stay a pure static
 * page: the Donut RPC does not send CORS headers, so we never call it.
 */
export function deriveUea(chain: CHAIN, address: string): string {
  if (isPushChain(chain)) return getAddress(address);

  const { namespace, chainId, vm } = chainMeta(chain);

  let ownerHex: `0x${string}`;
  if (vm === VM.EVM) {
    ownerHex = getAddress(address); // validates + checksums; throws if malformed
  } else {
    const bytes = Uint8Array.from(bs58.decode(address));
    if (bytes.length !== 32) throw new Error('Невалідна Solana-адреса (очікується 32 байти).');
    ownerHex = bytesToHex(bytes);
  }

  const encodedAccountId = encodeAbiParameters(
    [
      {
        type: 'tuple',
        components: [
          { name: 'chainNamespace', type: 'string' },
          { name: 'chainId', type: 'string' },
          { name: 'owner', type: 'bytes' },
        ],
      },
    ],
    [{ chainNamespace: namespace, chainId, owner: ownerHex }]
  );
  const salt = keccak256(encodedAccountId);

  // EIP-1167 minimal-proxy runtime code pointing at the Push UEA implementation.
  const runtimeCode = ('0x3d602d80600a3d3981f3363d3d373d3d3d363d73' +
    PROXY.toLowerCase().replace(/^0x/, '') +
    '5af43d82803e903d91602b57fd5bf3') as `0x${string}`;
  const initCodeHash = keccak256(runtimeCode);

  return getCreate2Address({ from: FACTORY, salt, bytecodeHash: initCodeHash });
}

// ---- Reverse lookup: UEA on Push Chain → origin account ----

const GET_ORIGIN_ABI = [
  {
    type: 'function',
    name: 'getOriginForUEA',
    stateMutability: 'view',
    inputs: [{ name: 'addr', type: 'address' }],
    outputs: [
      {
        name: 'account',
        type: 'tuple',
        components: [
          { name: 'chainNamespace', type: 'string' },
          { name: 'chainId', type: 'string' },
          { name: 'owner', type: 'bytes' },
        ],
      },
      { name: 'isUEA', type: 'bool' },
    ],
  },
] as const;

export interface OriginAccount {
  isUEA: boolean;
  namespace: string;
  chainId: string;
  /** Owner formatted for its namespace: EVM → checksummed 0x…, SVM → base58. */
  owner: string;
}

/**
 * Ask the Push UEA factory who owns a given UEA — the inverse of deriveUea.
 * One read-only `getOriginForUEA` eth_call through Blockscout's RPC proxy; the
 * factory itself stores the mapping (set when it emitted `UEADeployed`), so this
 * is authoritative, not a guess. Returns `isUEA:false` for any address the
 * factory never registered (a plain wallet, or a UEA not deployed yet).
 */
export async function resolveOrigin(uea: string): Promise<OriginAccount> {
  const data = encodeFunctionData({
    abi: GET_ORIGIN_ABI,
    functionName: 'getOriginForUEA',
    args: [getAddress(uea)],
  });
  const raw = await ethCall(FACTORY, data);
  const [account, isUEA] = decodeFunctionResult({
    abi: GET_ORIGIN_ABI,
    functionName: 'getOriginForUEA',
    data: raw as `0x${string}`,
  }) as [{ chainNamespace: string; chainId: string; owner: `0x${string}` }, boolean];

  const namespace = account.chainNamespace;
  const ownerHex = account.owner;
  let owner = ownerHex as string;
  if (isUEA && ownerHex && ownerHex !== '0x') {
    if (namespace === VM_NAMESPACE[VM.SVM]) {
      owner = bs58.encode(hexToBytes(ownerHex));
    } else {
      // EVM origins store a 20-byte address.
      try {
        owner = getAddress(ownerHex as Address);
      } catch {
        owner = ownerHex;
      }
    }
  }
  return { isUEA, namespace, chainId: account.chainId, owner };
}
