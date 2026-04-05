import { CONFIG } from '../../config/swarm.config.mjs';

const vault = new Map(); // taskId -> { lockedAmount, requesterId }

export function lockEscrow(taskId, requesterId, amount = CONFIG.DEFAULT_CREDIT_ESCROW) {
    vault.set(taskId, { lockedAmount: amount, requesterId });
}

export function settleEscrow(taskId, isSuccess, scholarId, verifierId, architectId) {
    if (!vault.has(taskId)) return null;

    const { lockedAmount, requesterId } = vault.get(taskId);
    vault.delete(taskId);

    let payout = {};
    if (isSuccess) {
        // Success split: 35% Scholar, 20% Verifier, 40% Architect, 5% Burned
        payout = {
            scholar: { id: scholarId, amount: lockedAmount * 0.35 },
            verifier: { id: verifierId, amount: lockedAmount * 0.20 },
            architect: { id: architectId, amount: lockedAmount * 0.40 },
            burn: lockedAmount * 0.05
        };
    } else {
        // Slash logic explicitly returns bulk cash back to system
        payout = {
            scholar: { id: scholarId, amount: 0 },
            verifier: { id: verifierId, amount: lockedAmount * 0.25 },
            refund: { id: requesterId, amount: lockedAmount * 0.75 }
        };
    }

    return payout;
}
