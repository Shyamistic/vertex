/**
 * OMNISWARM v4.0 — Mutual Information Task–Agent Router
 *
 * Routes tasks to agents based on mutual information between task semantics
 * and agent execution history, enabling emergent division of labour.
 *
 * MATHEMATICS:
 *   Mutual information: I(T; A) = H(T) - H(T | A_history)
 *
 *   Approximation via TF-IDF cosine similarity:
 *     sim(task_vec, agent_history_vec) ≈ 1 - H(T | A)
 *
 *   TF-IDF weighting:
 *     TF(t, d)  = count(t in d) / |d|
 *     IDF(t)    = log(N / (1 + df(t)))   [smoothed]
 *     TFIDF(t, d) = TF(t, d) × IDF(t)
 *
 *   Cosine similarity:
 *     sim(q, d) = (q · d) / (||q|| × ||d||)
 *
 *   MI bonus contribution to auction bid:
 *     B_MI = sim(task, agent_history) × 20
 *
 *   This creates emergent specialisation: agents that historically execute
 *   similar tasks receive higher bonuses, self-reinforcing their domain expertise.
 */

export class MutualInfoRouter {
    constructor() {
        /** @type {Map<string, Map<string, number>>} agentId → term → raw count */
        this._agentTermCounts = new Map();
        /** @type {Map<string, number>} agentId → total token count */
        this._agentTokenCounts = new Map();
        /** @type {Map<string, number>} term → document frequency */
        this._docFreq = new Map();
        this._totalDocuments = 0;
    }

    /**
     * Tokenise text into lowercased word stems.
     * @param {string} text
     * @returns {string[]}
     */
    _tokenize(text) {
        return (text || '')
            .toLowerCase()
            .replace(/[^a-z0-9\s]/g, ' ')
            .split(/\s+/)
            .filter(t => t.length > 2)
            .map(t => t.substring(0, 8)); // crude stemming: truncate at 8 chars
    }

    /**
     * Update an agent's TF-IDF profile with a completed task.
     * @param {string} agentId
     * @param {string} taskText
     */
    updateAgentHistory(agentId, taskText) {
        const tokens = this._tokenize(taskText);
        if (tokens.length === 0) return;

        if (!this._agentTermCounts.has(agentId)) this._agentTermCounts.set(agentId, new Map());
        const termCounts = this._agentTermCounts.get(agentId);

        const seen = new Set();
        for (const t of tokens) {
            termCounts.set(t, (termCounts.get(t) || 0) + 1);
            if (!seen.has(t)) {
                this._docFreq.set(t, (this._docFreq.get(t) || 0) + 1);
                seen.add(t);
            }
        }

        this._agentTokenCounts.set(agentId, (this._agentTokenCounts.get(agentId) || 0) + tokens.length);
        this._totalDocuments++;
    }

    /**
     * Compute TF-IDF vector for a text (sparse, only non-zero terms).
     * @param {string} text
     * @param {Map<string,number>|null} termCounts - if null, computes from text
     * @param {number} totalTokens
     * @returns {Map<string, number>}
     */
    _tfidfVector(text, termCounts = null, totalTokens = 1) {
        const tokens = this._tokenize(text);
        const counts = termCounts || tokens.reduce((m, t) => (m.set(t, (m.get(t) || 0) + 1), m), new Map());
        const N = Math.max(this._totalDocuments, 1);
        const vec = new Map();
        for (const [term, count] of counts.entries()) {
            const tf  = count / Math.max(totalTokens, 1);
            const df  = this._docFreq.get(term) || 0;
            const idf = Math.log(N / (1 + df));
            if (idf > 0) vec.set(term, tf * idf);
        }
        return vec;
    }

    _dotProduct(v1, v2) {
        let dot = 0;
        for (const [term, val] of v1.entries()) {
            if (v2.has(term)) dot += val * v2.get(term);
        }
        return dot;
    }

    _norm(v) {
        let sum = 0;
        for (const val of v.values()) sum += val * val;
        return Math.sqrt(sum);
    }

    /**
     * Compute MI-based routing bonus for (task, agent) pair.
     * @param {string} taskText
     * @param {string} agentId
     * @returns {number} bonus in range [0, 20]
     */
    computeBonus(taskText, agentId) {
        if (!this._agentTermCounts.has(agentId)) return 0;

        const taskVec   = this._tfidfVector(taskText);
        const agentVec  = this._tfidfVector(
            '', // not used if termCounts provided
            this._agentTermCounts.get(agentId),
            this._agentTokenCounts.get(agentId) || 1
        );

        const dot  = this._dotProduct(taskVec, agentVec);
        const norm = this._norm(taskVec) * this._norm(agentVec);
        const sim  = norm > 0 ? dot / norm : 0;

        return Math.max(0, Math.min(20, sim * 20));
    }

    /**
     * Return ranked agents for a task by MI similarity.
     * @param {string} taskText
     * @param {number} n - top N
     * @returns {Array<{agentId, mi_bonus, similarity}>}
     */
    getTopAgentsForTask(taskText, n = 3) {
        const results = [];
        for (const agentId of this._agentTermCounts.keys()) {
            const bonus = this.computeBonus(taskText, agentId);
            results.push({ agentId, mi_bonus: +bonus.toFixed(3), similarity: +(bonus / 20).toFixed(4) });
        }
        return results.sort((a, b) => b.mi_bonus - a.mi_bonus).slice(0, n);
    }

    getStats() {
        return {
            agents_profiled: this._agentTermCounts.size,
            vocabulary_size: this._docFreq.size,
            documents_indexed: this._totalDocuments
        };
    }
}
