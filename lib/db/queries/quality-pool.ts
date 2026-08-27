/**
 * Stable public facade for the consent-gated content quality pool.
 *
 * Keep consumers on this path; implementation is split by read, write, and
 * learner-suggestion concerns while key and consent SQL stay canonical.
 */

export { poolSourceCondition } from './quality-pool-shared';
export {
  getPoolItems,
  getQualityPool,
  getQualityPoolRow,
} from './quality-pool-read';
export type {
  PoolAudioFilter,
  PoolAudioSide,
  PoolItem,
  PoolRow,
  PoolSort,
} from './quality-pool-types';
export * from './quality-pool-writes';
export * from './quality-pool-suggestions';
