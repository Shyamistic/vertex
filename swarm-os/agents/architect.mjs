import { OmniAgent } from '../src/agent/core.mjs';
import { CONFIG } from '../src/config.mjs';
import { askLLM } from '../src/agent/llm.mjs';
import { v4 as uuidv4 } from 'uuid';

export class ArchitectAgent extends OmniAgent {
    constructor(agentId, nodeUrl) {
        super(agentId, nodeUrl);
        this.activeTasks = new Map();
    }

    onCustomMessage(topic, payload) {
        // Architect mostly listens for Bid and Result phases
        if (topic.startsWith(CONFIG.TOPIC_BID)) {
            this.handleBid(payload);
        } else if (topic.startsWith(CONFIG.TOPIC_RESULT)) {
            this.handleResult(payload);
        }
    }

    async submitQuery(macroQuery, isElite = true) {
        console.log(`\n[${this.agentId}] Received Macro-Query: "${macroQuery}"`);
        console.log(`[${this.agentId}] Consulting DeepSeek LLM for optimal DAG task split...`);
        
        let subtasks = [];
        try {
            const llmPrompt = `Break this high-level query into 3 distinct atomic research tasks: "${macroQuery}". Format the output strictly as a JSON array of strings. Do not output anything else.`;
            const splitResponse = await askLLM(llmPrompt, "You are the Omni Swarm Architect. Output only a flat JSON array of strings.", isElite);
            subtasks = JSON.parse(splitResponse);
        } catch (e) {
            console.log(`[${this.agentId}] Cognitive API parse failed, using fallback subtasks...`);
            subtasks = ['Execute local heuristic scan', 'Perform threat pattern matching', 'Map kill-chain vectors'];
        }

        const tasks = subtasks.map(str => ({ id: uuidv4(), context: str }));

        for (const t of tasks) {
            this.activeTasks.set(t.id, {
                context: t.context,
                bids: [],
                status: 'BIDDING',
                winner: null
            });
            this.publishSigned(`${CONFIG.TOPIC_TASK}/${t.id}`, { action: 'propose', taskId: t.id, context: t.context });
        }

        // Wait for bidding phase to end
        setTimeout(() => this.resolveBids(), CONFIG.BIDDING_TIMEOUT_MS);
    }

    handleBid(payload) {
        if (!this.activeTasks.has(payload.taskId)) return;
        const task = this.activeTasks.get(payload.taskId);
        if (task.status !== 'BIDDING') return;

        task.bids.push({
            scholar: payload.sender,
            cost: payload.cost,
            score: payload.score
        });
        console.log(`[${this.agentId}] Received bid from ${payload.sender} for task ${payload.taskId.substring(0,6)}: ${payload.cost} credits`);
    }

    resolveBids() {
        for (const [taskId, task] of this.activeTasks.entries()) {
            if (task.status !== 'BIDDING') continue;
            
            if (task.bids.length === 0) {
                console.log(`[${this.agentId}] Task ${taskId.substring(0,6)} failed: No bids received.`);
                continue;
            }

            // Deterministic selection: highest score minus cost
            task.bids.sort((a, b) => (b.score - b.cost) - (a.score - a.cost));
            task.winner = task.bids[0].scholar;
            task.status = 'EXECUTING';

            console.log(`[${this.agentId}] Deterministic Winner for ${taskId.substring(0,6)} is ${task.winner}`);
            // Note: In a true leaderless system, all agents run this exact sort simultaneously and agree.
            // By Architect publishing the assign, it's just a formality for logging in this demo.
        }
    }

    handleResult(payload) {
        if (!this.activeTasks.has(payload.taskId)) return;
        const task = this.activeTasks.get(payload.taskId);
        task.status = 'VERIFYING';
        console.log(`[${this.agentId}] Scholar ${payload.sender} finished ${payload.taskId.substring(0,6)}.`);
    }

    onPeerDead(deadAgentId) {
        // Track 3 Requirement: Resilience & Self-Healing
        // Automatically throw orphaned tasks back into the auction pool
        for (const [taskId, task] of this.activeTasks.entries()) {
            if (task.winner === deadAgentId && task.status === 'EXECUTING') {
                console.log(`[${this.agentId}] !! CRITICAL !! ORPHANED TASK DETECTED. Re-auctioning ${taskId.substring(0,6)}...`);
                task.status = 'BIDDING';
                task.winner = null;
                task.bids = [];
                this.publishSigned(`${CONFIG.TOPIC_TASK}/${taskId}`, { action: 'propose', taskId, context: task.context });
                setTimeout(() => this.resolveBids(), CONFIG.BIDDING_TIMEOUT_MS);
            }
        }
    }
}
