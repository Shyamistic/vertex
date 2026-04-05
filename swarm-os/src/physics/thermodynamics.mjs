/**
 * OMNISWARM v4.0 — Thermodynamic Swarm Entropy Monitor
 *
 * WORLD-FIRST: Applies the Second Law of Thermodynamics to predict
 * cognitive swarm collapse ("heat death") from task injection/completion rates.
 *
 * MATHEMATICS:
 *   Entropy rate: dS/dt = Ṡ_in - Ṡ_out - Ṡ_overhead
 *   where:
 *     Ṡ_in  = task injection rate (tasks/sec submitted)
 *     Ṡ_out = task completion rate (verifications/sec)
 *     Ṡ_overhead = log₂(active_agents) × message_rate_per_agent
 *
 *   Heat death prediction: queue_depth / max(Ṡ_in - Ṡ_out, ε) → ETA in seconds
 *   When dS/dt > 0 persistently for PREDICT_WINDOW seconds → THERMAL_OVERLOAD_IMMINENT
 *
 *   Shannon task entropy: H = -Σⱼ pⱼ log₂(pⱼ) (agents as "microstates")
 */

import { logStructuredEvent } from '../proof/event_logger.mjs';

const PREDICT_WINDOW_S = 30;
const WINDOW_MS = 60000;

export class ThermodynamicMonitor {
    constructor() {
        this._injections = [];   // timestamps of task injections
        this._completions = [];  // timestamps of task completions
        this._messages    = [];  // timestamps of all messages
        this._activeAgents = 0;
        this._queueDepth  = 0;
        this._dSdt_history = []; // { t, dSdt }
        this._heatDeathWarnings = 0;
    }

    recordTaskInjection() {
        const now = Date.now();
        this._injections.push(now);
        this._queueDepth = Math.max(0, this._queueDepth + 1);
        this._prune();
    }

    recordTaskCompletion() {
        const now = Date.now();
        this._completions.push(now);
        this._queueDepth = Math.max(0, this._queueDepth - 1);
        this._prune();
    }

    recordMessage() {
        this._messages.push(Date.now());
    }

    setActiveAgents(n) { this._activeAgents = n; }

    _prune() {
        const cutoff = Date.now() - WINDOW_MS;
        this._injections  = this._injections.filter(t => t > cutoff);
        this._completions = this._completions.filter(t => t > cutoff);
        this._messages    = this._messages.filter(t => t > cutoff);
    }

    _rate(arr, windowMs = 10000) {
        const cutoff = Date.now() - windowMs;
        return arr.filter(t => t > cutoff).length / (windowMs / 1000);
    }

    /**
     * Compute thermodynamic state of the swarm.
     * @returns {{ H: number, dSdt: number, Sin: number, Sout: number, S_overhead: number }}
     */
    computeEntropy() {
        this._prune();
        const Sin       = this._rate(this._injections);
        const Sout      = this._rate(this._completions);
        const msgRate   = this._rate(this._messages);
        const n         = Math.max(1, this._activeAgents);
        // Ṡ_overhead = log₂(n) × msg_rate_per_agent
        const S_overhead = Math.log2(n) * (msgRate / n);
        const dSdt      = Sin - Sout - S_overhead;

        // Shannon entropy over agent participation (simplified: uniform per agent)
        const H = n > 1 ? Math.log2(n) : 0;

        const entry = { t: Date.now(), dSdt };
        this._dSdt_history.push(entry);
        if (this._dSdt_history.length > 120) this._dSdt_history.shift();

        return { H, dSdt, Sin, Sout, S_overhead, queue_depth: this._queueDepth, active_agents: n };
    }

    /**
     * Predict whether heat death is imminent.
     * @returns {{ imminent: boolean, eta_seconds: number, confidence: string }}
     */
    predictHeatDeath() {
        const recent = this._dSdt_history.slice(-Math.ceil(PREDICT_WINDOW_S * 2));
        if (recent.length < 5) return { imminent: false, eta_seconds: Infinity, confidence: 'LOW' };

        // Check if dS/dt has been persistently positive
        const positive = recent.filter(e => e.dSdt > 0).length;
        const fraction = positive / recent.length;

        const { dSdt }  = this.computeEntropy();
        const eps = 0.001;
        const eta = this._queueDepth / Math.max(Math.abs(dSdt), eps);

        const imminent = fraction > 0.7 && dSdt > 0;
        if (imminent) {
            this._heatDeathWarnings++;
            logStructuredEvent('THERMAL_OVERLOAD_IMMINENT', 'ThermodynamicMonitor', {
                eta_seconds: eta.toFixed(1),
                dSdt: dSdt.toFixed(4),
                queue_depth: this._queueDepth
            }).catch(() => {});
        }

        return {
            imminent,
            eta_seconds: isFinite(eta) ? Math.round(eta) : 9999,
            confidence: recent.length >= 20 ? 'HIGH' : 'MEDIUM',
            overheating_fraction: fraction
        };
    }

    getStats() {
        const { H, dSdt, Sin, Sout } = this.computeEntropy();
        const hd = this.predictHeatDeath();
        return {
            entropy_H: H.toFixed(3),
            dSdt: dSdt.toFixed(4),
            task_injection_rate: Sin.toFixed(3),
            task_completion_rate: Sout.toFixed(3),
            heat_death_imminent: hd.imminent,
            eta_seconds: hd.eta_seconds,
            warnings_fired: this._heatDeathWarnings
        };
    }
}
