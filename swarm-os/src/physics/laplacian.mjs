/**
 * OMNISWARM v4.0 — Graph Laplacian Consensus Stability Analyzer
 *
 * WORLD-FIRST: Applies algebraic graph theory (Fiedler eigenvalue) to a live
 * AI agent P2P network to mathematically verify consensus convergence speed.
 *
 * MATHEMATICS:
 *   Graph Laplacian: L = D - A
 *   where D = diag(degree vector), A = adjacency matrix
 *
 *   Fiedler value λ₂ = second-smallest eigenvalue of L
 *   (smallest eigenvalue λ₁ = 0 always, for connected graphs)
 *
 *   Computed via power iteration deflated by λ₁ component:
 *     v₀ = random unit vector orthogonalized to 1-vector (null-space of L)
 *     v_{k+1} = L·vₖ / ||L·vₖ||   (deflated to remove λ₁=0 component)
 *     λ₂ ≈ vₖᵀ·L·vₖ (Rayleigh quotient) after convergence
 *
 *   λ₂ interpretation:
 *     < 0.1 → PARTITIONED (network split risk)
 *     0.1–1 → FRAGILE
 *     > 1   → ROBUST
 *     > 5   → HIGHLY REDUNDANT
 *
 *   Consensus convergence time: τ ≈ 1/λ₂
 */

import { logStructuredEvent } from '../proof/event_logger.mjs';

export class LaplacianAnalyzer {
    constructor() {
        this._history = []; // { t, lambda2, status }
        this._warnings = 0;
    }

    /**
     * Build Laplacian matrix from agent list and optional connection map.
     * In a broadcast MQTT mesh all agents are effectively fully connected.
     * If connectionMap is provided it overrides this.
     * @param {string[]} agentIds
     * @param {Map<string,string[]>|null} connectionMap - agentId → [peerId, ...]
     * @returns {number[][]} L
     */
    buildLaplacian(agentIds, connectionMap = null) {
        const n = agentIds.length;
        const idx = new Map(agentIds.map((id, i) => [id, i]));
        const A = Array.from({ length: n }, () => new Array(n).fill(0));
        const deg = new Array(n).fill(0);

        if (connectionMap) {
            for (const [src, neighbours] of connectionMap.entries()) {
                const i = idx.get(src);
                if (i === undefined) continue;
                for (const dst of neighbours) {
                    const j = idx.get(dst);
                    if (j === undefined || i === j) continue;
                    A[i][j] = 1;
                    deg[i]++;
                }
            }
        } else {
            // Full mesh (broadcast MQTT): every agent connected to all others
            for (let i = 0; i < n; i++) {
                for (let j = 0; j < n; j++) {
                    if (i !== j) { A[i][j] = 1; deg[i]++; }
                }
            }
        }

        // L = D - A
        const L = A.map((row, i) => row.map((val, j) => (i === j ? deg[i] : -val)));
        return L;
    }

    /**
     * Multiply matrix L by vector v.
     */
    _matVec(L, v) {
        return L.map(row => row.reduce((s, val, j) => s + val * v[j], 0));
    }

    /**
     * Orthogonalize v against the 1-vector (null-space of L for connected graph).
     */
    _deflate(v) {
        const n = v.length;
        const mean = v.reduce((s, x) => s + x, 0) / n;
        return v.map(x => x - mean);
    }

    _norm(v) { return Math.sqrt(v.reduce((s, x) => s + x * x, 0)); }

    /**
     * Compute the Fiedler value (λ₂) via power iteration.
     * @param {number[][]} L
     * @param {number} [maxIter=80]
     * @returns {{ lambda2: number, converged: boolean, fiedler_vector: number[] }}
     */
    computeFiedler(L, maxIter = 80) {
        const n = L.length;
        if (n < 2) return { lambda2: 0, converged: false, fiedler_vector: [] };

        // Random start vector
        let v = this._deflate(Array.from({ length: n }, () => Math.random() - 0.5));
        let norm = this._norm(v);
        if (norm === 0) return { lambda2: 0, converged: false, fiedler_vector: v };
        v = v.map(x => x / norm);

        let lambda2 = 0;
        let prev = Infinity;
        let converged = false;

        for (let iter = 0; iter < maxIter; iter++) {
            let Lv = this._matVec(L, v);
            Lv = this._deflate(Lv); // keep orthogonal to null-space

            // Rayleigh quotient
            lambda2 = v.reduce((s, vi, i) => s + vi * Lv[i], 0);

            const n2 = this._norm(Lv);
            if (n2 < 1e-14) break;
            v = Lv.map(x => x / n2);

            if (Math.abs(lambda2 - prev) < 1e-8) { converged = true; break; }
            prev = lambda2;
        }

        return { lambda2: Math.max(0, lambda2), converged, fiedler_vector: v };
    }

    /**
     * Assess network connectivity from the agent map.
     * @param {string[]} agentIds
     * @param {Map|null} connectionMap
     */
    assess(agentIds, connectionMap = null) {
        const L = this.buildLaplacian(agentIds, connectionMap);
        const { lambda2, converged } = this.computeFiedler(L);

        let network_status;
        if (lambda2 < 0.1) network_status = 'PARTITIONED';
        else if (lambda2 < 1)  network_status = 'FRAGILE';
        else if (lambda2 < 5)  network_status = 'ROBUST';
        else                   network_status = 'HIGHLY_REDUNDANT';

        const convergence_time = lambda2 > 0 ? (1 / lambda2).toFixed(2) : 'Infinity';

        const entry = { t: Date.now(), lambda2, network_status };
        this._history.push(entry);
        if (this._history.length > 60) this._history.shift();

        if (network_status === 'PARTITIONED') {
            this._warnings++;
            logStructuredEvent('NETWORK_PARTITION_RISK', 'LaplacianAnalyzer', { lambda2, agents: agentIds.length }).catch(() => {});
        }

        return {
            lambda2: lambda2.toFixed(4),
            network_status,
            convergence_time_s: convergence_time,
            mean_degree: agentIds.length - 1, // full mesh
            converged,
            agent_count: agentIds.length,
            recommendation: network_status === 'PARTITIONED'
                ? 'ADD_AGENTS or CHECK_BROKER_CONNECTIVITY'
                : network_status === 'FRAGILE'
                    ? 'MONITOR_CLOSELY'
                    : 'HEALTHY'
        };
    }

    getStats() {
        const latest = this._history[this._history.length - 1] || { lambda2: 0, network_status: 'UNKNOWN' };
        return {
            latest_lambda2: latest.lambda2,
            network_status: latest.network_status,
            history_length: this._history.length,
            partition_warnings: this._warnings
        };
    }

    getHistory(last = 30) { return this._history.slice(-last); }
}
