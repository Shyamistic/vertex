import { CONFIG } from '../../config/swarm.config.mjs';

/**
 * Per-agent instance replay cache.
 * The global singleton caused false-positives when multiple agents
 * share the same Node.js process — agent B would see agent A's nonce
 * as a "replay" because the global cache already had it from agent A's own processing.
 */
export class ReplayCache {
    constructor() {
        this._cache = new Map();
        this._rejected = 0;
        this._replays  = 0;
    }

    isReplay(nonce, timestamp_ms) {
        const now = Date.now();
        const ttlMs = CONFIG.NONCE_TTL_SECONDS * 1000;

        // Stale message outside TTL window
        if (now - timestamp_ms > ttlMs) {
            this._rejected++;
            return true;
        }

        // Duplicate nonce within window
        if (this._cache.has(nonce)) {
            this._replays++;
            this._rejected++;
            return true;
        }

        this._cache.set(nonce, timestamp_ms);

        // Prune expired entries
        if (this._cache.size > 500) {
            for (const [n, ts] of this._cache) {
                if (now - ts > ttlMs) this._cache.delete(n);
            }
        }

        return false;
    }

    get stats() {
        return { rejected: this._rejected, replays: this._replays, window_size: this._cache.size };
    }
}

// Legacy singleton export (kept for test suite compatibility)
const _globalCache = new ReplayCache();
export const isReplay = (nonce, ts) => _globalCache.isReplay(nonce, ts);
export const getReplayStats = () => _globalCache.stats;
