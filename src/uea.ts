import {
  encodeAbiParameters,
  keccak256,
  getCreate2Address,
  getAddress,
  bytesToHex,
  type Address,
} from 'viem';
import bs58 from 'bs58';
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
