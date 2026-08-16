/** core/services/storage-service.ts —— 存档服务接口（IndexedDB 契约） */
export interface StorageService {
  init(): Promise<void>;
  save(key: string, data: unknown): Promise<void>;
  load<T>(key: string): Promise<T | null>;
  remove(key: string): Promise<void>;
}
