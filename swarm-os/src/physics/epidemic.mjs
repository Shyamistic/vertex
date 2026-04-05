/**
 * OMNISWARM v4.0 — SIR Epidemic Model for Hallucination Quality Control
 *
 * WORLD-FIRST: Applies the SIR epidemiological model to track and predict
 * hallucination contamination spreading through RAG context chains in an AI swarm.
 *
 * MATHEMATICS (Kermack-McKendrick SIR):
 *   dS/dt = -β × S × I / N
 *   dI/dt = β × S × I / N - γ × I
 *   dR/dt = γ × I
 *
 *   where:
 *     S = susceptible tasks (uncontaminated)
 *     I = infected tasks (using contaminated RAG context)
 *     R = recovered tasks (verified and quarantined)
 *     N = S + I + R (total tasks)
 *
 *   β = contamination rate (probability a new task retrieves contaminated RAG result)
 *   γ = recovery rate = verifications_per_second / max(I, 1)
 *
 *   Basic Reproduction Number: R₀ = β / γ
 *     R₀ > 1 → EPIDEMIC (hallucinations spreading faster than caught)
 *     R₀ < 1 → ENDEMIC  (contained)
 *     R₀ = 1 → THRESHOLD (critical point)
 */

import { logStructuredEvent } from '../proof/event_logger.mjs';

export class EpidemicMonitor {
    constructor() {
        this._S = 100;  // Start with 100 "susceptible" slots
        this._I = 0;
        this._R = 0;
        this._N = 100;

        this._contaminations = [];  // { timestamp, taskId, source }
        this._recoveries = [];       // { timestamp, taskId }
        this._quarantined = new Set(); // contaminated result hashes banned from RAG

        this._R0_history = [];
        this._emergencyResponses = 0;
    }

    /**
     * Mark a task as infected via contaminated RAG context.
     * @param {string} taskId
     * @param {string} sourceTaskId - the contaminating source task
     */
    recordContamination(taskId, sourceTaskId) {
        this._I = Math.min(this._I + 1, this._N);
        this._S = Math.max(0, this._S - 1);
        this._contaminations.push({ timestamp: Date.now(), taskId, sourceTaskId });
        this._quarantined.add(sourceTaskId);
    }

    /**
     * Mark a task as verified and recovered (cleaned).
     * @param {string} taskId
     */
    recordRecovery(taskId) {
        if (this._I > 0) {
            this._I--;
            this._R++;
        }
        this._recoveries.push({ timestamp: Date.now(), taskId });
    }

    /**
     * Add a new susceptible task to the pool.
     */
    addTask() {
        this._N++;
        this._S++;
    }

    /**
     * Compute current SIR state and R₀.
     */
    computeSIR() {
        const now = Date.now();
        const window = 30000; // 30s window for rate computation
        const cutoff = now - window;

        const recentContaminations = this._contaminations.filter(c => c.timestamp > cutoff).length;
        const recentRecoveries     = this._recoveries.filter(r => r.timestamp > cutoff).length;

        // β = contamination events per second per infected per susceptible
        const windowSec = window / 1000;
        const beta = this._I > 0 && this._S > 0
            ? (recentContaminations / windowSec) * this._N / Math.max(this._I * this._S, 1)
            : 0.01;

        // γ = recovery rate per infected
        const gamma = this._I > 0
            ? (recentRecoveries / windowSec) / this._I
            : 0.5; // default: 50% recovery rate

        const R0 = gamma > 0 ? beta / gamma : 0;
        const is_epidemic = R0 > 1;

        const entry = { t: now, R0, S: this._S, I: this._I, R: this._R, is_epidemic };
        this._R0_history.push(entry);
        if (this._R0_history.length > 120) this._R0_history.shift();

        if (R0 > 1.5) this._emergencyResponse(R0);

        return {
            S: this._S, I: this._I, R: this._R, N: this._N,
            beta: beta.toFixed(4),
            gamma: gamma.toFixed(4),
            R0: R0.toFixed(3),
            is_epidemic,
            quarantined_count: this._quarantined.size,
            status: R0 > 1 ? 'EPIDEMIC' : R0 > 0.5 ? 'ENDEMIC' : 'CONTAINED'
        };
    }

    /**
     * Check if a result hash is quarantined (banned from RAG).
     */
    isQuarantined(taskIdOrHash) {
        return this._quarantined.has(taskIdOrHash);
    }

    _emergencyResponse(R0) {
        this._emergencyResponses++;
        logStructuredEvent('EPIDEMIC_EMERGENCY_RESPONSE', 'EpidemicMonitor', {
            R0: R0.toFixed(3),
            infected_tasks: this._I,
            quarantined: this._quarantined.size,
            action: 'BAN_CONTAMINATED_RAG + REQUEST_EXTRA_VERIFIER'
        }).catch(() => {});
    }

    getStats() {
        const sir = this.computeSIR();
        return {
            ...sir,
            emergency_responses: this._emergencyResponses,
            history_length: this._R0_history.length
        };
    }

    getHistory(last = 30) { return this._R0_history.slice(-last); }
}
