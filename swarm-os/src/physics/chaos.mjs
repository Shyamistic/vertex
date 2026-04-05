/**
 * OMNISWARM v4.0 — Chaos Theory Early Warning System
 *
 * WORLD-FIRST: Applies bifurcation theory and Critical Slowing Down (CSD)
 * to detect impending phase transitions in swarm dynamics before they occur.
 *
 * MATHEMATICS:
 *   Rolling variance (30-sample window W):
 *     σ²(t) = (1/W) Σ_{i=t-W}^{t} (xᵢ - x̄)²
 *     where x = task completion time series
 *
 *   Lag-1 autocorrelation:
 *     AR(1) = Σᵢ (xᵢ - x̄)(xᵢ₋₁ - x̄) / Σᵢ (xᵢ - x̄)²
 *
 *   Critical Slowing Down indicator:
 *     CSD(t) = σ²(t) × AR(1)(t)
 *
 *   Bifurcation risk (rate of increase of both metrics):
 *     R_bif = Δσ²/Δt × ΔAR(1)/Δt
 *     When R_bif exceeds threshold → CRITICAL_SLOWING_DOWN_DETECTED
 *
 *   Physical interpretation: near a bifurcation point, the system "slows down"
 *   in recovering from perturbations, causing both variance and autocorrelation
 *   to increase simultaneously. This is a generic early warning signal.
 */

import { logStructuredEvent } from '../proof/event_logger.mjs';

const WINDOW = 30;
const CSD_THRESHOLD = 50;

export class ChaosMonitor {
    constructor() {
        this._completionTimes = []; // rolling buffer
        this._csd_history = []; // { t, variance, autocorr, CSD, bifurcation_risk }
        this._warnings = 0;
        this._prevVariance = null;
        this._prevAutocorr = null;
        this._prevT = null;
    }

    /**
     * Record a task completion time in milliseconds.
     * @param {number} ms
     */
    recordCompletionTime(ms) {
        this._completionTimes.push(ms);
        if (this._completionTimes.length > WINDOW * 2) this._completionTimes.shift();
    }

    _mean(arr) { return arr.length > 0 ? arr.reduce((s, v) => s + v, 0) / arr.length : 0; }

    /**
     * Compute rolling variance (σ²) of the window.
     */
    _variance(arr) {
        if (arr.length < 2) return 0;
        const m = this._mean(arr);
        return arr.reduce((s, v) => s + Math.pow(v - m, 2), 0) / arr.length;
    }

    /**
     * Compute lag-1 autocorrelation.
     *   AR(1) = Cov(x_t, x_{t-1}) / Var(x)
     */
    _autocorrelation(arr) {
        if (arr.length < 3) return 0;
        const m = this._mean(arr);
        let num = 0, den = 0;
        for (let i = 1; i < arr.length; i++) {
            num += (arr[i] - m) * (arr[i - 1] - m);
            den += Math.pow(arr[i] - m, 2);
        }
        return den > 0 ? num / den : 0;
    }

    /**
     * Compute Early Warning Signals.
     * @returns {{ variance: number, autocorrelation: number, CSD: number, bifurcation_risk: number, warning_level: string }}
     */
    computeEWS() {
        const window = this._completionTimes.slice(-WINDOW);
        if (window.length < 5) return { variance: 0, autocorrelation: 0, CSD: 0, bifurcation_risk: 0, warning_level: 'INSUFFICIENT_DATA' };

        const variance    = this._variance(window);
        const autocorr    = this._autocorrelation(window);
        const CSD         = variance * Math.max(0, autocorr);

        const now = Date.now();
        let bifurcation_risk = 0;
        let warning_level = 'NORMAL';

        if (this._prevVariance !== null && this._prevT !== null) {
            const dt = Math.max((now - this._prevT) / 1000, 0.1);
            const dVar  = (variance  - this._prevVariance) / dt;
            const dCorr = (autocorr  - (this._prevAutocorr ?? 0)) / dt;
            bifurcation_risk = dVar * dCorr; // product of rates of increase

            if (bifurcation_risk > CSD_THRESHOLD) {
                warning_level = 'CRITICAL_SLOWING_DOWN';
                this._warnings++;
                logStructuredEvent('CRITICAL_SLOWING_DOWN_DETECTED', 'ChaosMonitor', {
                    variance: variance.toFixed(2),
                    autocorrelation: autocorr.toFixed(4),
                    CSD: CSD.toFixed(2),
                    bifurcation_risk: bifurcation_risk.toFixed(2)
                }).catch(() => {});
            } else if (CSD > 20) {
                warning_level = 'ELEVATED';
            }
        }

        this._prevVariance  = variance;
        this._prevAutocorr  = autocorr;
        this._prevT         = now;

        const entry = { t: now, variance, autocorrelation: autocorr, CSD, bifurcation_risk, warning_level };
        this._csd_history.push(entry);
        if (this._csd_history.length > 120) this._csd_history.shift();

        return entry;
    }

    getStats() {
        const latest = this._csd_history[this._csd_history.length - 1]
            || { variance: 0, autocorrelation: 0, CSD: 0, bifurcation_risk: 0, warning_level: 'NORMAL' };
        return {
            ...latest,
            csd_warnings: this._warnings,
            samples_collected: this._completionTimes.length
        };
    }

    getHistory(last = 30) { return this._csd_history.slice(-last); }
}
