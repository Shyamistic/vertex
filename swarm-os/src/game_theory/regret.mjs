/**
 * OMNISWARM v4.0 — Multiplicative Weights Update (MWU) Regret Minimizer
 *
 * Agents learn their optimal bidding strategy through no-regret online learning.
 * Provably converges to Nash equilibrium in O(√T) rounds.
 *
 * MATHEMATICS:
 *   Bid multiplier set: M = {0.5, 0.7, 0.9, 1.0, 1.1, 1.3, 1.5}
 *   Initial weights: wₖ = 1 for all k ∈ M
 *
 *   Counterfactual reward for multiplier k in round t:
 *     r_k = (score - k×cost) × P(win | b = k×cost, others) - cost × 1{win with k}
 *     P(win | b) ≈ (b - min_opponent) / (max_b - min_opponent)  [linear interpolation]
 *
 *   Regret for unchosen multiplier k: regret_k = r(k) - r(chosen)
 *
 *   MWU weight update:
 *     wₖ ← wₖ × exp(η × regret_k)
 *     where η = sqrt(ln(|M|) / T)  [optimal learning rate, T = round number]
 *
 *   Normalisation: pₖ = wₖ / Σⱼ wⱼ
 *
 *   Regret bound: Σᵗ r(chosen_t) ≥ max_k Σᵗ r(k) - O(√T × ln(|M|))
 *   → sublinear regret guarantees convergence to Nash equilibrium strategy
 */

export class RegretMinimizer {
    constructor(agentId) {
        this.agentId  = agentId;
        this.MULTIPLIERS = [0.5, 0.7, 0.9, 1.0, 1.1, 1.3, 1.5];
        this._weights = new Array(this.MULTIPLIERS.length).fill(1.0);
        this._round   = 0;
        this._totalRegret = 0;
        this._lastChosen  = null;
        this._lastChosenIdx = null;
    }

    /**
     * Sample a bid multiplier from the current weight distribution.
     * @returns {{ multiplier: number, index: number }}
     */
    chooseBidMultiplier() {
        const total = this._weights.reduce((s, w) => s + w, 0);
        const probs = this._weights.map(w => w / total);

        let r = Math.random();
        for (let i = 0; i < probs.length; i++) {
            r -= probs[i];
            if (r <= 0) {
                this._lastChosenIdx = i;
                this._lastChosen = this.MULTIPLIERS[i];
                return { multiplier: this.MULTIPLIERS[i], index: i };
            }
        }
        // Fallback
        this._lastChosenIdx = this.MULTIPLIERS.length - 1;
        this._lastChosen = this.MULTIPLIERS[this.MULTIPLIERS.length - 1];
        return { multiplier: this._lastChosen, index: this._lastChosenIdx };
    }

    /**
     * Record the outcome of the chosen multiplier.
     * @param {number} multiplierUsed
     * @param {number} rewardReceived   - actual utility received (0 if lost)
     * @param {number} cost             - true cost estimate
     * @param {number} score            - agent reputation score
     * @param {number} minOpponentBid   - lowest opponent net bid observed
     * @param {number} maxBid           - highest bid in the round
     */
    recordOutcome(multiplierUsed, rewardReceived, cost, score, minOpponentBid = 0, maxBid = 100) {
        this._round++;
        const eta = Math.sqrt(Math.log(this.MULTIPLIERS.length) / this._round);

        // Counterfactual rewards for each multiplier
        const counterfactuals = this.MULTIPLIERS.map(mult => {
            const altBid  = mult * cost;
            const altNet  = score - altBid;
            // Linear P(win) approximation
            const range   = maxBid - minOpponentBid;
            const pWin    = range > 0 ? Math.max(0, Math.min(1, (altNet - minOpponentBid) / range)) : 0.5;
            return (score - altBid - cost) * pWin;
        });

        // Regret = counterfactual - actual
        const regrets = counterfactuals.map(r => r - rewardReceived);
        this._totalRegret += Math.max(...regrets) - rewardReceived;

        // MWU update: wₖ ← wₖ × exp(η × regretₖ)
        for (let i = 0; i < this._weights.length; i++) {
            this._weights[i] *= Math.exp(eta * regrets[i]);
        }

        // Numerical stability: renormalize if weights get very large
        const maxW = Math.max(...this._weights);
        if (maxW > 1e6) {
            this._weights = this._weights.map(w => w / maxW);
        }

        return { regrets, counterfactuals, eta };
    }

    getDistribution() {
        const total = this._weights.reduce((s, w) => s + w, 0);
        return {
            multipliers: this.MULTIPLIERS,
            probabilities: this._weights.map(w => +(w / total).toFixed(4)),
            weights: this._weights.map(w => +w.toFixed(4))
        };
    }

    getStats() {
        const dist = this.getDistribution();
        const maxIdx = dist.probabilities.indexOf(Math.max(...dist.probabilities));
        return {
            agent_id: this.agentId,
            round: this._round,
            dominant_multiplier: this.MULTIPLIERS[maxIdx],
            dominant_probability: dist.probabilities[maxIdx],
            total_regret: this._totalRegret.toFixed(4),
            distribution: dist
        };
    }
}
