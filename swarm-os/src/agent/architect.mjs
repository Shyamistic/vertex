import { OmniAgent } from './core.mjs';
import { CONFIG } from '../../config/swarm.config.mjs';
import { askLLM } from '../llm/router.mjs';
import { lockEscrow } from '../economy/escrow.mjs';
import { computeSpecializationBonus } from '../economy/profiles.mjs';
import { logEconomyRound } from '../proof/economy_rounds.mjs';
import { v4 as uuidv4 } from 'uuid';

export class ArchitectAgent extends OmniAgent {
    constructor(agentId, nodeUrl) {
        super(agentId, nodeUrl);
        this.activeTasks = new Map();
        this.subtaskLocks = new Map(); // Feature 8
        this.degradationLevel = 'NOMINAL'; // Feature 15
    }

    onCustomMessage(topic, payload, senderId) {
        if (topic.startsWith(CONFIG.TOPIC_BID)) this.handleBid(payload, senderId);
        else if (topic.startsWith(CONFIG.TOPIC_RESULT)) this.handleResult(payload, senderId);
    }

    /**
     * Decomposes the macro query with XML Chain of Thought
     */
    async submitQuery(macroQuery, isElite = true) {
        if (this.degradationLevel === 'CRITICAL') {
            console.log(`[${this.agentId}] Swarm CRITICAL. Pausing new queries.`);
            return;
        }

        console.log(`\n[${this.agentId}] Decomposing Macro-Query: "${macroQuery}"`);
        
        // Feature 27 & 30 - XML Chain-of-Thought and Classifiers
        const llmPrompt = `
        Break this query into distinct atomic research tasks: "${macroQuery}". 
        Use XML tags <thinking>...</thinking> for your reasoning.
        Format the output after thinking strictly as a JSON array of objects: [{ "subtask": "...", "complexity": "SIMPLE|MODERATE|COMPLEX", "required_skill": "research|code_gen" }]
        `;
        
        let subtasks = [];
        try {
            const rawResponse = await askLLM(llmPrompt, "You are the Omni Swarm Architect.", isElite);
            // Quick regex extraction to separate XML from JSON
            const jsonMatch = rawResponse.match(/\[.*\]/s);
            if (jsonMatch) {
                subtasks = JSON.parse(jsonMatch[0]);
            } else { throw new Error('Bad parse'); }
        } catch (e) {
            subtasks = [ 
                { subtask: 'Execute local heuristic scan', complexity: 'SIMPLE', required_skill: 'research' },
                { subtask: 'Perform threat pattern matching', complexity: 'MODERATE', required_skill: 'research' }
            ];
        }

        for (const t of subtasks) {
            const id = uuidv4();
            
            // Feature 23 - Task Pricing Oracle
            const costHeuristic = t.subtask.split(' ').length * CONFIG.COMPUTE_RATE_PER_TOKEN;
            const taskCredit = Math.max(CONFIG.DEFAULT_CREDIT_ESCROW, costHeuristic * 10);
            lockEscrow(id, this.agentId, taskCredit);

            this.activeTasks.set(id, {
                context: t.subtask,
                complexity: t.complexity,
                required_skill: t.required_skill,
                bids: [],
                status: 'BIDDING',
                winner: null,
                round: 1,
                lastOrphanCheck: Date.now()
            });

            this.publishSigned(`${CONFIG.TOPIC_TASK}/${id}`, { action: 'propose', taskId: id, context: t.subtask, required_skill: t.required_skill });
        }

        setTimeout(() => this.resolveBids(), CONFIG.BIDDING_TIMEOUT_MS);
        
        // Feature 17 - Orphan Watchdog
        setInterval(() => this.orphanWatchdog(), 5000);
    }

    handleBid(payload, senderId) {
        if (!this.activeTasks.has(payload.taskId)) return;
        const task = this.activeTasks.get(payload.taskId);
        if (task.status !== 'BIDDING') return;
        if (!senderId) return; // Malformed envelope

        // Dedupe: same agent can't bid twice on the same task
        if (task.bids.find(b => b.agent_id === senderId)) return;

        // Feature 21 - Specialization Bonus
        const bonus = computeSpecializationBonus(senderId, task.required_skill);
        const netBid = (payload.score || 50) - (payload.cost || 1) + bonus;

        task.bids.push({
            agent_id: senderId,
            cost: payload.cost || 1,
            score: payload.score || 50,
            specialization_bonus: bonus,
            net_bid: netBid
        });
        console.log(`[${this.agentId}] Bid received from ${senderId} for ${payload.taskId?.substring(0,6)} (net: ${netBid.toFixed(1)})`);
    }

    async resolveBids() {
        for (const [taskId, task] of this.activeTasks.entries()) {
            if (task.status !== 'BIDDING') continue;
            if (this.subtaskLocks.has(taskId)) continue; // Already resolving

            // Feature 20 - Adaptive Quorum: accept any bids after 2 rounds, cap at MAX_ROUNDS
            const MAX_ROUNDS = 5;
            const hasBids = task.bids.length >= 1;
            const roundsExhausted = task.round >= MAX_ROUNDS;

            if (!hasBids && !roundsExhausted) {
                task.round++;
                console.log(`[${this.agentId}] No bids yet for ${taskId.substring(0,6)}. Round ${task.round}/${MAX_ROUNDS}`);
                setTimeout(() => this.resolveBids(), CONFIG.BIDDING_TIMEOUT_MS);
                continue;
            }

            if (!hasBids && roundsExhausted) {
                console.log(`[${this.agentId}] ⚠ Task ${taskId.substring(0,6)} received ZERO bids after ${MAX_ROUNDS} rounds. Abandoning.`);
                task.status = 'ABANDONED';
                continue;
            }

            // Feature 8 - Double Assignment Prevention Lock
            this.subtaskLocks.set(taskId, true);

            task.bids.sort((a, b) => b.net_bid - a.net_bid);
            task.winner = task.bids[0].agent_id;
            task.status = 'EXECUTING';
            task.lastOrphanCheck = Date.now();

            const losers = task.bids.slice(1).map(l => ({ ...l, rejection_reason: `Outbid by ${(task.bids[0].net_bid - l.net_bid).toFixed(1)}` }));

            await logEconomyRound(taskId, task.round, [task.bids[0], ...losers], task.winner, `Highest net bid`, [], { arithmetic: 'score - cost + bonus' });

            console.log(`\x1b[32m[${this.agentId}] ✓ ASSIGNED: ${taskId.substring(0,6)} → ${task.winner} (${task.bids.length} bids, round ${task.round})\x1b[0m`);

            // CRITICAL: Broadcast winner so Scholar agents can execute
            this.publishSigned(`${CONFIG.TOPIC_BID}/${taskId}`, {
                action: 'assign',
                taskId,
                winner: task.winner,
                context: task.context
            });
        }
    }

    handleResult(payload, senderId) {
        if (!this.activeTasks.has(payload.taskId)) return;
        const task = this.activeTasks.get(payload.taskId);
        task.status = 'VERIFYING';
        task.lastOrphanCheck = Date.now(); // Reset orphan timer
        console.log(`[${this.agentId}] Result submitted by ${senderId} for ${payload.taskId?.substring(0,6)}`);
    }

    orphanWatchdog() {
        for (const [taskId, task] of this.activeTasks.entries()) {
            if (task.status === 'EXECUTING' && Date.now() - task.lastOrphanCheck > 8000) {
                console.log(`[${this.agentId}] TASK_ORPHANED: ${taskId.substring(0,6)}`);
                task.status = 'BIDDING';
                task.winner = null;
                task.bids = [];
                task.round = 1;
                this.subtaskLocks.delete(taskId);
                this.publishSigned(`${CONFIG.TOPIC_TASK}/${taskId}`, { action: 'propose', taskId, context: task.context, required_skill: task.required_skill });
                setTimeout(() => this.resolveBids(), CONFIG.BIDDING_TIMEOUT_MS);
            }
        }
    }

    onPeerDead(deadAgentId) {
        // Immediate Orphan trigger and Degradation tracking
        const deadCount = Array.from(this.peers.values()).filter(p => p.status === 'DEAD').length;
        if (deadCount >= 1) this.degradationLevel = 'DEGRADED';
        if (deadCount > this.peers.size * 0.3) this.degradationLevel = 'CRITICAL';
        
        console.log(`[${this.agentId}] Auto-adjusting cluster degradation layer -> ${this.degradationLevel}`);
        this.orphanWatchdog(); // Force sweep
    }
}
