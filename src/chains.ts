import { CHAIN } from './uea';

export type VmKind = 'evm' | 'svm';

export interface OriginChain {
  /** Stable id used in the ?chain= URL param and the <select>. */
  id: string;
  /** The SDK CHAIN enum value this maps to. */
  chain: CHAIN;
  label: string;
  vm: VmKind;
  /** A real example address on this origin chain, one click away. */
  example: string;
  /** Short note shown under the example button. */
  exampleNote: string;
}

// Only origin chains that Push maps to the Donut testnet are offered here.
// The EVM example addresses are real origin wallets whose UEADeployed event is
// on Donut (so they have a deployed, active UEA) — verified from the factory's
// logs. Where no verified-active example exists for a chain, we reuse a real
// owner address; the tool then shows the honest "no UEA activity yet" state,
// which is itself a valid answer.
export const ORIGIN_CHAINS: OriginChain[] = [
  {
    id: 'eth-sepolia',
    chain: CHAIN.ETHEREUM_SEPOLIA,
    label: 'Ethereum Sepolia',
    vm: 'evm',
    example: '0xdcffb983a2d59f45718afdf5029efcf30a7c85a6',
    exampleNote: 'реальний власник з активним UEA на Donut',
  },
  {
    id: 'bnb-testnet',
    chain: CHAIN.BNB_TESTNET,
    label: 'BNB Smart Chain testnet',
    vm: 'evm',
    example: '0x9cfa6f508dfe4d72e335183abd0fc562b7ac8a50',
    exampleNote: 'реальний власник з активним UEA на Donut',
  },
  {
    id: 'base-sepolia',
    chain: CHAIN.BASE_SEPOLIA,
    label: 'Base Sepolia',
    vm: 'evm',
    example: '0xdcffb983a2d59f45718afdf5029efcf30a7c85a6',
    exampleNote: 'той самий власник, інший origin-чейн',
  },
  {
    id: 'arbitrum-sepolia',
    chain: CHAIN.ARBITRUM_SEPOLIA,
    label: 'Arbitrum Sepolia',
    vm: 'evm',
    example: '0x9cfa6f508dfe4d72e335183abd0fc562b7ac8a50',
    exampleNote: 'той самий власник, інший origin-чейн',
  },
  {
    id: 'push',
    chain: CHAIN.PUSH_TESTNET_DONUT,
    label: 'Push Chain (Donut, native)',
    vm: 'evm',
    example: '0x99Ea0aC8f7F7CbBBaf7ca61644Eef591d290ca4B',
    exampleNote: 'адреса вже на Push Chain — UEA це вона сама',
  },
  {
    id: 'solana-devnet',
    chain: CHAIN.SOLANA_DEVNET,
    label: 'Solana Devnet',
    vm: 'svm',
    example: '11111111111111111111111111111111',
    exampleNote: 'приклад Solana-адреси (base58, 32 байти)',
  },
];

export function findChain(id: string | null): OriginChain | undefined {
  if (!id) return undefined;
  return ORIGIN_CHAINS.find((c) => c.id === id);
}

// ---- Donut testnet facts (from the SDK's own constants) ----
export const DONUT = {
  chainId: 42101,
  rpc: 'https://evm.donut.rpc.push.org/',
  explorer: 'https://donut.push.network',
  blockscoutApi: 'https://donut.push.network/api/v2',
  nativeSymbol: 'PC',
  nativeDecimals: 18,
};

export function donutAddressUrl(address: string): string {
  return `${DONUT.explorer}/address/${address}`;
}

export function donutTxUrl(hash: string): string {
  return `${DONUT.explorer}/tx/${hash}`;
}
