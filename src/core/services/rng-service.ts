/** core/services/rng-service.ts —— 随机数服务接口（种子化，逻辑层契约） */
export interface RNGService {
  /** [0,1) */
  next(): number;
  /** [min, max] 闭区间整数 */
  int(min: number, max: number): number;
  pick<T>(arr: readonly T[]): T;
  chance(p: number): boolean;
}
