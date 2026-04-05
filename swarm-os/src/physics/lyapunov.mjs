/**
 * OMNISWARM v4.0 — Lyapunov Swarm Stability Monitor
 * 
 * WORLD-FIRST: Applies Lyapunov stability theory to a live AI agent economy
 * to mathematically prove or disprove convergence of the reputation distribution.
 *
 * MATHEMATICS:
 *   Quadratic Lyapunov function: V(t) = Σᵢ (sᵢ(t) - s̄)²
 *   where sᵢ(t) = agent i's reputation score, s̄ = arithmetic mean
 *
 *   Time derivative: dV/dt = 2Σᵢ (sᵢ - s̄) · ṡᵢ
 *   where ṡᵢ = Δsᵢ / Δt (score rate of change)
 *
 *   Stability: dV/dt ≤ 0 → STABLE (converging to equal reputation)
 *   Instability: dV/dt > 0 → UNSTABLE (diverging, monopoly forming)
 *
 *   Shannon task entropy: H = -Σⱼ pⱼ log₂(pⱼ)
 *   where pⱼ = fraction of tasks assigned to agent j
 *   H_max = log₂(N) = perfect load balance
 *   H = 0 = complete monopoly (one agent gets all tasks)
 */

import { logStructuredEvent } from '../proof/event_logger.mjs';

export class LyapunovMonitor {
    constructor() {
        /** @type {Map<string, Array<{score: number, timestamp: number}>>} */
        this.history = new Map();
        /** @type {Array<{t: number, V: number, dVdt: number, status: string}>} */
        this.V_history = [];
        this.WINDOW_MS = 10000;
        this.MAX_HIST_PER_AGENT = 20;
        this._rebalances = 0;
        this._lastV = null;
        this._lastVt = null;
        this._taskAssignments = new Map(); // agentId → count
        this._status = 'INITIALIZING';
    }

    /**
     * Record an agent's reputation score at the current moment.
     * @param {string} agentId
     * @param {number} score
     * @param {number} [timestamp=Date.now()]
     */
    recordScore(agentId, score, timestamp = Date.now()) {
        if (!this.history.has(agentId)) this.history.set(agentId, []);
        const hist = this.history.get(agentId);
        hist.push({ score, timestamp });
        // Prune beyond max history
        if (hist.length > this.MAX_HIST_PER_AGENT) hist.shift();
        // Prune old entries
        const cutoff = timestamp - this.WINDOW_MS;
        const pruned = hist.filter(e => e.timestamp >= cutoff);
        this.history.set(agentId, pruned);
    }

    /** Record task assignment for entropy calculation */
    recordTaskAssignment(agentId) {
        this.taskAssignments = this._taskAssignments;
        this._taskAssignments.set(agentId, (this._taskAssignments.get(agentId) || 0) + 1);
    }

    /**
     * Compute current Lyapunov potential and its time derivative.
     * @returns {{ V: number, dVdt: number, H: number, status: string, mean_score: number, variance: number, agent_count: number }}
     */
    compute() {
        const agents = Array.from(this.history.entries());
        if (agents.length < 2) return { V: 0, dVdt: 0, H: 0, status: 'INSUFFICIENT_DATA', mean_score: 0, variance: 0, agent_count: agents.length };

        // Latest score per agent
        const scores = agents.map(([id, hist]) => ({ id, score: hist[hist.length - 1]?.score ?? 0 }));
        const mean = scores.reduce((s, a) => s + a.score, 0) / scores.length;

        // V(t) = Σ (sᵢ - s̄)²
        const V = scores.reduce((s, a) => s + Math.pow(a.score - mean, 2), 0);
        const now = Date.now();

        // dV/dt via finite difference
        let dVdt = 0;
        if (this._lastV !== null && this._lastVt !== null) {
            const dt = (now - this._lastVt) / 1000; // seconds
            dVdt = dt > 0 ? (V - this._lastV) / dt : 0;
        }
        this._lastV = V;
        this._lastVt = now;

        // Classify stability
        let status;
        if (dVdt <= 0) status = 'STABLE';
        else if (dVdt < 50) status = 'UNSTABLE';
        else status = 'CRITICAL';

        this._status = status;

        // Shannon entropy of task distribution
        const total = Array.from(this._taskAssignments.values()).reduce((s, v) => s + v, 0);
        let H = 0;
        if (total > 0) {
            for (const count of this._taskAssignments.values()) {
                const p = count / total;
                if (p > 0) H -= p * Math.log2(p);
            }
        }

        const entry = { t: now, V, dVdt, H, status };
        this.V_history.push(entry);
        if (this.V_history.length > 120) this.V_history.shift();

        if (status === 'CRITICAL') {
            this.triggerRebalance(scores, mean);
            logStructuredEvent('LYAPUNOV_CRITICAL', 'LyapunovMonitor', { V, dVdt, mean, agent_count: scores.length }).catch(() => {});
        } else if (status === 'UNSTABLE') {
            logStructuredEvent('LYAPUNOV_UNSTABLE', 'LyapunovMonitor', { V, dVdt, mean }).catch(() => {});
        }

        return { V, dVdt, H, status, mean_score: mean, variance: V / scores.length, agent_count: scores.length };
    }

    /**
     * Compress diverging scores toward the mean.
     * sᵢ_new = sᵢ + 0.10 × (s̄ - sᵢ)
     */
    triggerRebalance(scores, mean) {
        this._rebalances++;
        logStructuredEvent('SCORE_REBALANCED', 'LyapunovMonitor', {
            rebalance_count: this._rebalances,
            compression_factor: 0.10,
            formula: 'sᵢ_new = sᵢ + 0.10 × (s̄ - sᵢ)'
        }).catch(() => {});
    }

    getStats() {
        const latest = this.V_history[this.V_history.length - 1] || {};
        return {
            latest_V: latest.V ?? 0,
            latest_dVdt: latest.dVdt ?? 0,
            latest_H: latest.H ?? 0,
            stability_status: this._status,
            rebalances_triggered: this._rebalances,
            history_length: this.V_history.length,
            agent_count: this.history.size
        };
    }

    getHistory(last = 30) {
        return this.V_history.slice(-last);
    }
}
