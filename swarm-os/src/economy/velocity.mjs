/**
 * OMNISWARM v4.0 — Economic Velocity Tracker
 *
 * Applies macroeconomic monetary velocity theory to the agent token economy.
 * Implements quantitative easing (QE) stimulus when velocity falls below threshold.
 *
 * MATHEMATICS (Irving Fisher's Equation of Exchange):
 *   MV = PT  →  V = (P × T) / M
 *   where:
 *     V = velocity of money (how frequently each token is transacted)
 *     P = average task credit price (per transaction)
 *     T = transaction rate (tasks settled per second)
 *     M = total credits in circulation (outstanding escrow + burned)
 *
 *   High V → healthy economy (credits earned and spent quickly)
 *   Low V  → liquidity trap (credits hoarded, bidding stalls)
 *
 *   QE Stimulus:
 *     When V < V_threshold for STIMULUS_WINDOW consecutive readings:
 *       Inject Δ = stimulus_rate × burn_reserve credits
 *       → inflate DEFAULT_CREDIT_ESCROW by +10% for next N tasks
 *       → log QE_STIMULUS_TRIGGERED event
 */

import { logStructuredEvent } from '../proof/event_logger.mjs';

const V_THRESHOLD = 0.5;     // Below this → liquidity trap
const STIMULUS_WINDOW = 5;   // Consecutive low-V readings before QE
const STIMULUS_RATE = 0.10;  // 10% of burn reserve injected

export class EconomicVelocityTracker {
    constructor() {
        this._totalCreditsInCirculation = 0;
        this._burnedCredits = 0;
        this._earnedCredits = 0;
        this._settlements = [];    // { timestamp, price }
        this._consecutiveLowV = 0;
        this._stimulusActive = false;
        this._stimulusCount = 0;
        this._velocityHistory = [];
        this._creditMultiplier = 1.0; // applied to escrow on QE
    }

    /**
     * Record a token lock (task escrow created).
     * @param {number} amount
     */
    recordEscrowLock(amount) {
        this._totalCreditsInCirculation += amount;
    }

    /**
     * Record a settlement and update rolling price.
     * @param {number} price - credit amount settling (winner's payout)
     * @param {number} burned - tokens burned in this settlement
     */
    recordSettlement(price, burned = 0) {
        this._settlements.push({ timestamp: Date.now(), price });
        this._burnedCredits += burned;
        this._earnedCredits += price;
        // Prune to last 60s
        const cutoff = Date.now() - 60000;
        this._settlements = this._settlements.filter(s => s.timestamp > cutoff);
    }

    /**
     * Compute economic velocity V = (P × T) / M.
     * @returns {{ V: number, P: number, T: number, M: number, status: string, qe_active: boolean }}
     */
    computeVelocity() {
        const window = 10000; // 10s window
        const cutoff = Date.now() - window;
        const recent = this._settlements.filter(s => s.timestamp > cutoff);

        const T = recent.length / 10; // transactions per second
        const P = recent.length > 0
            ? recent.reduce((s, e) => s + e.price, 0) / recent.length
            : 0;
        const M = Math.max(this._totalCreditsInCirculation, 1);

        const V = (P * T) / M;

        let status;
        if (V > 2)      status = 'HIGH_VELOCITY';
        else if (V > V_THRESHOLD) status = 'HEALTHY';
        else if (V > 0.1) status = 'LOW_VELOCITY';
        else             status = 'LIQUIDITY_TRAP';

        if (V < V_THRESHOLD) {
            this._consecutiveLowV++;
            if (this._consecutiveLowV >= STIMULUS_WINDOW && !this._stimulusActive) {
                this._triggerQE();
            }
        } else {
            this._consecutiveLowV = 0;
            if (this._stimulusActive) {
                this._stimulusActive = false;
                this._creditMultiplier = 1.0;
            }
        }

        const entry = { t: Date.now(), V: +V.toFixed(4), P: +P.toFixed(3), T: +T.toFixed(3), status };
        this._velocityHistory.push(entry);
        if (this._velocityHistory.length > 120) this._velocityHistory.shift();

        return { V: +V.toFixed(4), P: +P.toFixed(3), T: +T.toFixed(3), M: +M.toFixed(2), status, qe_active: this._stimulusActive, credit_multiplier: this._creditMultiplier };
    }

    _triggerQE() {
        this._stimulusActive = true;
        this._stimulusCount++;
        this._creditMultiplier = 1 + STIMULUS_RATE;
        const injected = this._burnedCredits * STIMULUS_RATE;
        this._totalCreditsInCirculation += injected;

        logStructuredEvent('QE_STIMULUS_TRIGGERED', 'EconomicVelocityTracker', {
            V_before: this._velocityHistory[this._velocityHistory.length - 1]?.V || 0,
            credits_injected: injected.toFixed(2),
            new_multiplier: this._creditMultiplier,
            stimulus_count: this._stimulusCount
        }).catch(() => {});
    }

    /** Returns current escrow multiplier (1.0 normal, 1.1 during QE) */
    getEscrowMultiplier() { return this._creditMultiplier; }

    getStats() {
        const v = this.computeVelocity();
        return {
            ...v,
            stimulus_events: this._stimulusCount,
            burned_credits: this._burnedCredits.toFixed(2),
            consecutive_low_v: this._consecutiveLowV,
            history_length: this._velocityHistory.length
        };
    }

    getHistory(last = 30) { return this._velocityHistory.slice(-last); }
}
