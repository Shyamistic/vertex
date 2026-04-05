import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { CONFIG } from '../config.mjs';

const seenNonces = new Set();

/**
 * Signs a payload using HMAC-SHA256
 */
export function signPayload(payload) {
    const data = { ...payload };
    delete data.sig; // ensure signature is not part of canonical string
    data.nonce = data.nonce || uuidv4();
    data.ts = data.ts || Date.now();

    const canonical = JSON.stringify(data, Object.keys(data).sort());
    const sig = crypto.createHmac('sha256', CONFIG.SWARM_SECRET).update(canonical).digest('hex');
    
    data.sig = sig;
    return data;
}

/**
 * Verifies a payload signature and checks for replays.
 */
export function verifyPayload(payload, agentSeenNonces) {
    if (!payload.sig || !payload.nonce || !payload.ts) return false;

    // Reject staled messages (older than 60 seconds)
    if (Date.now() - payload.ts > 60000) return false;

    // Reject replays
    if (agentSeenNonces && agentSeenNonces.has(payload.nonce)) return false;

    const sig = payload.sig;
    const data = { ...payload };
    delete data.sig;

    const canonical = JSON.stringify(data, Object.keys(data).sort());
    const expectedSig = crypto.createHmac('sha256', CONFIG.SWARM_SECRET).update(canonical).digest('hex');
    
    if (sig === expectedSig) {
        if (agentSeenNonces) {
            agentSeenNonces.add(payload.nonce);
            // keep memory footprint low
            if (agentSeenNonces.size > 10000) {
                const first = agentSeenNonces.keys().next().value;
                agentSeenNonces.delete(first);
            }
        }
        return true;
    }
    return false;
}
