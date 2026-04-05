import crypto from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';

const keysCache = new Map();

/**
 * Initializes and retrieves the Ed25519 identity keypair for an agent.
 */
export async function getOrGenerateIdentity(agentId) {
    if (keysCache.has(agentId)) return keysCache.get(agentId);

    const keysDir = path.join(process.cwd(), 'agents', 'keys');
    await fs.mkdir(keysDir, { recursive: true });

    const keyPath = path.join(keysDir, `${agentId}.json`);

    try {
        const data = JSON.parse(await fs.readFile(keyPath, 'utf8'));
        const privateKey = crypto.createPrivateKey({ key: data.privateKey, format: 'pem' });
        const publicKey = crypto.createPublicKey({ key: data.publicKey, format: 'pem' });
        keysCache.set(agentId, { privateKey, publicKey, publicKeyPem: data.publicKey });
        return keysCache.get(agentId);
    } catch (e) {
        // Generate new keypair natively
        const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
        const pubPem = publicKey.export({ type: 'spki', format: 'pem' });
        const privPem = privateKey.export({ type: 'pkcs8', format: 'pem' });

        await fs.writeFile(keyPath, JSON.stringify({ publicKey: pubPem, privateKey: privPem }), 'utf8');

        keysCache.set(agentId, { privateKey, publicKey, publicKeyPem: pubPem });
        return keysCache.get(agentId);
    }
}

export function signPayload(data, privateKey) {
    const stringified = typeof data === 'string' ? data : JSON.stringify(data);
    return crypto.sign(null, Buffer.from(stringified), privateKey).toString('hex');
}

export function verifySignature(data, signatureStr, publicKeyPem) {
    try {
        const stringified = typeof data === 'string' ? data : JSON.stringify(data);
        const publicKey = typeof publicKeyPem === 'string' ? crypto.createPublicKey({ key: publicKeyPem, format: 'pem' }) : publicKeyPem;
        return crypto.verify(null, Buffer.from(stringified), publicKey, Buffer.from(signatureStr, 'hex'));
    } catch(e) {
        return false;
    }
}
