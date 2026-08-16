/**
 * infrastructure/indexed-db-storage.ts —— IndexedDB 实现（实现 StorageService）
 * 环境不支持（node / 隐私模式）时回退到内存 Map，保证不抛错。
 */
import type { StorageService } from '../core/services/storage-service';

export class IndexedDbStorage implements StorageService {
  private db: IDBDatabase | null = null;
  private readonly storeName = 'save';
  private readonly mem = new Map<string, unknown>();

  async init(): Promise<void> {
    if (typeof indexedDB === 'undefined') return;
    try {
      this.db = await new Promise<IDBDatabase>((resolve, reject) => {
        const req = indexedDB.open('bubble-war', 1);
        req.onupgradeneeded = () => {
          if (!req.result.objectStoreNames.contains(this.storeName)) {
            req.result.createObjectStore(this.storeName);
          }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    } catch {
      this.db = null;
    }
  }

  async save(key: string, data: unknown): Promise<void> {
    if (this.db) {
      await new Promise<void>((resolve, reject) => {
        const tx = this.db!.transaction(this.storeName, 'readwrite');
        tx.objectStore(this.storeName).put(data, key);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } else {
      this.mem.set(key, data);
    }
  }

  async load<T>(key: string): Promise<T | null> {
    if (this.db) {
      return new Promise<T | null>((resolve, reject) => {
        const tx = this.db!.transaction(this.storeName, 'readonly');
        const req = tx.objectStore(this.storeName).get(key);
        req.onsuccess = () => resolve((req.result as T | undefined) ?? null);
        req.onerror = () => reject(req.error);
      });
    }
    return (this.mem.get(key) as T | undefined) ?? null;
  }

  async remove(key: string): Promise<void> {
    if (this.db) {
      await new Promise<void>((resolve, reject) => {
        const tx = this.db!.transaction(this.storeName, 'readwrite');
        tx.objectStore(this.storeName).delete(key);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } else {
      this.mem.delete(key);
    }
  }
}
