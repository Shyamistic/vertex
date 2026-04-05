import { promises as fs } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

let sequenceTracker = 0;
let runIdentifier = `run_${Date.now()}`;
let lastLoggedHash = null;

export async function logStructuredEvent(eventType, agentId, payloadData, signature = '') {
    const ts = new Date().toISOString();
    sequenceTracker++;

    // Compute causal hash
    const payloadHash = crypto.createHash('sha256').update(JSON.stringify(payloadData)).digest('hex');
    const causalHash = crypto.createHash('sha256').update(`${lastLoggedHash || 'genesis'}${payloadHash}`).digest('hex');
    lastLoggedHash = causalHash;

    const entry = {
        seq: sequenceTracker,
        timestamp: ts,
        event_type: eventType,
        agent_id: agentId,
        payload_hash: payloadHash,
        causal_dag_hash: causalHash,
        signature: signature
    };

    const runDir = path.join(process.cwd(), 'artifacts', runIdentifier);
    await fs.mkdir(runDir, { recursive: true });
    
    const filePath = path.join(runDir, 'structured_event_log.json');
    
    // Append atomically (basic read-append-write for simple logger without DB limits)
    let logs = [];
    try {
        const existing = await fs.readFile(filePath, 'utf8');
        logs = JSON.parse(existing);
    } catch(e) {} // file might not exist

    logs.push(entry);
    
    // Atomically rotate
    const tmpPath = `${filePath}.tmp`;
    await fs.writeFile(tmpPath, JSON.stringify(logs, null, 2), 'utf8');
    await fs.rename(tmpPath, filePath);
    
    return causalHash;
}

export function getCurrentRunId() { return runIdentifier; }
export function setRunId(id) { runIdentifier = id; }
export function getCurrentStateHash() { return lastLoggedHash; }
