import { promises as fs } from 'node:fs';
import path from 'node:path';
import { getCurrentRunId } from './event_logger.mjs';

/**
 * Appends a resolved bid round to the independent economic ledger
 * @param {string} subtaskId 
 * @param {number} roundNumber 
 * @param {Array} candidates - Bidders [{agent_id, score, cost, net_bid, specialization_bonus}]
 * @param {string} winner - Agent ID of the winner
 * @param {string} selectionReason 
 * @param {Array} budgetRejections - Bidders denied for budget
 * @param {object} breakdown - Mathematical log of the scores 
 */
export async function logEconomyRound(subtaskId, roundNumber, candidates, winner, selectionReason, budgetRejections, breakdown) {
    const runDir = path.join(process.cwd(), 'artifacts', getCurrentRunId());
    await fs.mkdir(runDir, { recursive: true });
    
    const filePath = path.join(runDir, 'economy_rounds.json');
    
    const record = {
        subtask_id: subtaskId,
        round_number: roundNumber,
        timestamp: new Date().toISOString(),
        candidates,
        winner,
        selection_reason: selectionReason,
        budget_rejections: budgetRejections,
        economy_score_breakdown: breakdown
    };

    let logs = [];
    try {
        const existing = await fs.readFile(filePath, 'utf8');
        logs = JSON.parse(existing);
    } catch(e) {}
    
    logs.push(record);
    
    const tmpPath = `${filePath}.tmp`;
    await fs.writeFile(tmpPath, JSON.stringify(logs, null, 2), 'utf8');
    await fs.rename(tmpPath, filePath);
}
