/**
 * Polymarket Tahmin Asistanı - Cache Utility
 * Basit memory cache yönetimi
 */

class CacheManager {
    constructor(defaultTimeout = 60000) {
        this.cache = new Map();
        this.defaultTimeout = defaultTimeout;
    }

    /**
     * Get item from cache
     */
    get(key) {
        const cached = this.cache.get(key);

        if (!cached) return null;

        if (Date.now() - cached.timestamp > cached.timeout) {
            this.cache.delete(key);
            return null;
        }

        return cached.data;
    }

    /**
     * Set item in cache
     */
    set(key, data, timeout = null) {
        this.cache.set(key, {
            data,
            timestamp: Date.now(),
            timeout: timeout || this.defaultTimeout
        });
    }

    /**
     * Check if key exists and is valid
     */
    has(key) {
        return this.get(key) !== null;
    }

    /**
     * Delete item from cache
     */
    delete(key) {
        return this.cache.delete(key);
    }

    /**
     * Clear all cache
     */
    clear() {
        this.cache.clear();
    }

    /**
     * Get cache size
     */
    size() {
        return this.cache.size;
    }

    /**
     * Clean expired entries
     */
    cleanup() {
        const now = Date.now();

        for (const [key, value] of this.cache.entries()) {
            if (now - value.timestamp > value.timeout) {
                this.cache.delete(key);
            }
        }
    }
}

// Export singleton instance
export const cache = new CacheManager();

// Auto cleanup every 5 minutes
setInterval(() => cache.cleanup(), 5 * 60 * 1000);
