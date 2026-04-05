import crypto from 'node:crypto';
import { getOrGenerateIdentity, signPayload } from './identity.mjs';

const HMAC_SECRET = process.env.SWARM_SECRET || 'vertex-hackathon-2026';

/**
 * Standardizes messages across the P2P Mesh into a strictly audited wrapper.
 */
export async function packEnvelope(agentId, type, payload) {
    const keys = await getOrGenerateIdentity(agentId);
    
    const timestamp_ms = Date.now();
    const nonce = crypto.randomBytes(16).toString('hex');
    
    // Legacy HMAC
    const hmac = crypto.createHmac('sha256', HMAC_SECRET)
                       .update(JSON.stringify(payload) + nonce + timestamp_ms)
                       .digest('hex');
                       
    // Ed25519 PKI Signature
    const ed25519_sig = signPayload(payload, keys.privateKey);

    return {
        v: 2,
        agent_id: agentId,
        type: type,
        nonce: nonce,
        timestamp_ms: timestamp_ms,
        payload: payload,
        hmac: hmac,
        ed25519_sig: ed25519_sig,
        public_key: keys.publicKeyPem // Attached for instant peer verification
    };
}
