import { encodeAbiParameters, keccak256, type Hex } from 'viem';

// A Uniswap v4 pool's id: the keccak256 of its ABI-encoded key, exactly as
// `PoolIdLibrary.toId` computes it on chain. The key's five fields are laid
// out as a struct (each in its own 32-byte word), so the hash is over 160
// bytes. `StateView.getSlot0(id)` and `getLiquidity(id)` take this id.

export type PoolKey = {
  currency0: `0x${string}`;
  currency1: `0x${string}`;
  fee: number;
  tickSpacing: number;
  hooks: `0x${string}`;
};

export function poolIdOf(key: PoolKey): Hex {
  return keccak256(encodeAbiParameters(
    [
      { name: 'currency0', type: 'address' },
      { name: 'currency1', type: 'address' },
      { name: 'fee', type: 'uint24' },
      { name: 'tickSpacing', type: 'int24' },
      { name: 'hooks', type: 'address' },
    ],
    [key.currency0, key.currency1, key.fee, key.tickSpacing, key.hooks],
  ));
}
