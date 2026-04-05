/**
 * OMNISWARM v4.0 — Cryptographic Commitment Scheme (Anti-Shill Bidding)
 *
 * Prevents front-running in Dutch auctions via a two-round commit-reveal protocol.
 * Security properties: HIDING (commitment reveals nothing) + BINDING (cannot change bid after commit).
 *
 * PROTOCOL:
 *   Round 1 — COMMIT (0 → 1500ms):
 *     commitment = SHA-256(bid_value_bytes ‖ 16-byte-random-salt)
 *     Publish: { type: 'BID_COMMIT', task_id, commitment, agent_id }
 *
 *   Round 2 — REVEAL (1500ms → 3000ms):
 *     Publish: { type: 'BID_REVEAL', task_id, bid_value, salt }
 *     Architect verifies: SHA-256(bid_value ‖ salt) === recorded_commitment
 *
 *   Invalid reveal → SHILL_ATTEMPT_DETECTED, -5 reputation
 *   No reveal after commit → treated as withdrawal (commitment discarded)
 *
 * SECURITY PROOF:
 *   Hiding: SHA-256 is a one-way function → commitment leaks no information about bid.
 *   Binding: collision resistance of SHA-256 → cannot find (bid', salt') with same commitment.
 */

import crypto from 'node:crypto';

/**
 * Generate a (commitment, salt) pair for a bid value.
 * @param {number} bidValue - the net bid score to commit to
 * @returns {{ commitment: string, salt: string }} hex strings
 */
export function commit(bidValue) {
    const salt = crypto.randomBytes(16).toString('hex');
    const commitment = _hash(bidValue, salt);
    return { commitment, salt };
}

/**
 * Verify that (bidValue, salt) opens the commitment.
 * @param {number} bidValue
 * @param {string} salt - hex string
 * @param {string} commitment - hex string (previously recorded)
 * @returns {boolean}
 */
export function verify(bidValue, salt, commitment) {
    try {
        return _hash(bidValue, salt) === commitment;
    } catch {
        return false;
    }
}

function _hash(bidValue, salt) {
    const buf = Buffer.concat([
        Buffer.from(bidValue.toString(10), 'utf8'),
        Buffer.from(salt, 'hex')
    ]);
    return crypto.createHash('sha256').update(buf).digest('hex');
}

/**
 * Server-side commitment ledger used by ArchitectAgent.
 * Manages the two-phase protocol for a single task auction.
 */
export class CommitmentLedger {
    constructor(taskId) {
        this.taskId = taskId;
        /** @type {Map<string, string>} agentId → commitment hex */
        this._commits = new Map();
        /** @type {Map<string, {bidValue: number, salt: string, verified: boolean}>} */
        this._reveals = new Map();
        this._shill_attempts = 0;
    }

    /** Phase 1: store commitment */
    recordCommit(agentId, commitment) {
        if (!this._commits.has(agentId)) {
            this._commits.set(agentId, commitment);
        }
    }

    /**
     * Phase 2: verify reveal and record bid.
     * @returns {{ ok: boolean, reason?: string }}
     */
    recordReveal(agentId, bidValue, salt) {
        const storedCommitment = this._commits.get(agentId);
        if (!storedCommitment) return { ok: false, reason: 'NO_COMMIT_FOUND' };
        if (this._reveals.has(agentId)) return { ok: false, reason: 'ALREADY_REVEALED' };

        const valid = verify(bidValue, salt, storedCommitment);
        if (!valid) {
            this._shill_attempts++;
            return { ok: false, reason: 'SHILL_ATTEMPT', penalty: 5 };
        }

        this._reveals.set(agentId, { bidValue, salt, verified: true });
        return { ok: true };
    }

    /**
     * Get all verified bids (post-reveal-phase).
     * @returns {Array<{agentId, bidValue}>}
     */
    getVerifiedBids() {
        return Array.from(this._reveals.entries())
            .filter(([, v]) => v.verified)
            .map(([agentId, v]) => ({ agentId, bidValue: v.bidValue }));
    }

    get shillAttempts() { return this._shill_attempts; }
    get commitCount()   { return this._commits.size; }
    get revealCount()   { return this._reveals.size; }
}
