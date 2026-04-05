import { promises as fs } from 'node:fs';
import path from 'node:path';
import { getCurrentRunId, logStructuredEvent } from '../proof/event_logger.mjs';
import { CONFIG } from '../../config/swarm.config.mjs';

const slashRecords = new Map(); // agentId -> count

export async function processSlash(agentId, verifierId, reason, currentScore) {
    let slashes = slashRecords.get(agentId) || 0;
    slashes++;
    slashRecords.set(agentId, slashes);

    const isQuarantined = slashes >= 3;
    const newScore = Math.max(0, currentScore - CONFIG.SLASH_PENALTY);

    const logEntry = {
        agent_id: agentId,
        verifier_id: verifierId,
        reason,
        slashes_total: slashes,
        quarantined: isQuarantined
    };

    // Broadcast into independent ledger
    await logStructuredEvent('SLASH', agentId, logEntry);

    // Save to distinct artifact log
    const runDir = path.join(process.cwd(), 'artifacts', getCurrentRunId());
    await fs.mkdir(runDir, { recursive: true });
    
    const filePath = path.join(runDir, 'slash_log.json');
    let logs = [];
    try { logs = JSON.parse(await fs.readFile(filePath, 'utf8')); } catch(e) {}
    logs.push(logEntry);
    await fs.writeFile(`${filePath}.tmp`, JSON.stringify(logs, null, 2), 'utf8');
    await fs.rename(`${filePath}.tmp`, filePath);

    return { isQuarantined, newScore };
}

export function isAgentQuarantined(agentId) {
    return (slashRecords.get(agentId) || 0) >= 3;
}
