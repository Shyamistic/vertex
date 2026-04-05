import { OmniAgent } from '../src/agent/core.mjs';
import { CONFIG } from '../src/config.mjs';
import { askLLM } from '../src/agent/llm.mjs';

export class ScholarAgent extends OmniAgent {
    constructor(agentId, nodeUrl, computeCost, isElite = false) {
        super(agentId, nodeUrl);
        this.computeCost = computeCost; // Cost to run a task
        this.isElite = isElite;
        this.biddedTasks = new Map();
    }

    onCustomMessage(topic, payload) {
        if (topic.startsWith(CONFIG.TOPIC_TASK)) {
            this.handleTaskProposal(payload);
        } else if (topic.startsWith(CONFIG.TOPIC_BID)) {
            this.handlePeerBid(payload);
        }
    }

    handleTaskProposal(payload) {
        // Evaluate if we should bid
        if (this.reputation.getScore(this.agentId) < 20) {
            console.log(`[${this.agentId}] Score too low to bid on ${payload.taskId.substring(0,6)}`);
            return;
        }

        const score = this.reputation.getScore(this.agentId);
        const cost = this.computeCost + Math.floor(Math.random() * 5); // Add jitter

        this.biddedTasks.set(payload.taskId, {
            context: payload.context,
            myBid: { cost, score },
            allBids: [] // Store everyone's bids
        });

        // Publish bid
        this.publishSigned(`${CONFIG.TOPIC_BID}/${payload.taskId}`, {
            action: 'bid',
            taskId: payload.taskId,
            cost,
            score
        });

        // Set timeout to deterministically pick a winner
        setTimeout(() => this.executeIfWinner(payload.taskId), CONFIG.BIDDING_TIMEOUT_MS + 200);
    }

    handlePeerBid(payload) {
        if (this.biddedTasks.has(payload.taskId)) {
            this.biddedTasks.get(payload.taskId).allBids.push({
                scholar: payload.sender,
                cost: payload.cost,
                score: payload.score
            });
        }
    }

    executeIfWinner(taskId) {
        const task = this.biddedTasks.get(taskId);
        if (!task) return;

        // Leaderless deterministic resolution
        const bids = task.allBids.concat([{
            scholar: this.agentId,
            cost: task.myBid.cost,
            score: task.myBid.score
        }]);

        bids.sort((a, b) => (b.score - b.cost) - (a.score - a.cost));
        const winner = bids[0].scholar;

        if (winner === this.agentId) {
            console.log(`[${this.agentId}] I WON task ${taskId.substring(0,6)}. Executing...`);
            this.executeTask(taskId, task.context, this.isElite);
        } else {
            // console.log(`[${this.agentId}] Lost task ${taskId.substring(0,6)} to ${winner}`);
        }
    }

    async executeTask(taskId, context, isElite) {
        // AI execution delay / processing
        try {
            const prompt = `You are an autonomous AI research scholar (Agent ID: ${this.agentId}). Analyze and solve this task concisely: "${context}". Output just the findings format.`;
            const analysis = await askLLM(prompt, "You are an autonomous RAG agent. Provide a single paragraph of dense structural analytical value.", isElite);
            
            // Append cognitive signature
            const simulatedData = `[DEEP-THINK-LLM] [${this.agentId}] ${analysis}`;
            
            // Publish result to swarm
            this.publishSigned(`${CONFIG.TOPIC_RESULT}/${taskId}`, {
                action: 'result',
                taskId,
                data: simulatedData
            });

            // Make it available to Hive Memory as retained message
            this.publishSigned(`${CONFIG.TOPIC_HIVE}/${taskId}`, {
                action: 'hive_store',
                taskId,
                data: simulatedData
            });
        } catch (e) {
            console.error(`[${this.agentId}] Task Execution Failed:`, e);
        }
    }
}
