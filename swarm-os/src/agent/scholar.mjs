import { OmniAgent } from './core.mjs';
import { CONFIG } from '../../config/swarm.config.mjs';
import { askLLM } from '../llm/router.mjs';
import { injectRAGContext, saveToRAGMemory } from '../llm/rag.mjs';
import crypto from 'node:crypto';

export class ScholarAgent extends OmniAgent {
    constructor(agentId, nodeUrl, isElite = false) {
        super(agentId, nodeUrl);
        this.isElite = isElite;
    }

    onCustomMessage(topic, payload, senderId) {
        if (topic.startsWith(CONFIG.TOPIC_TASK)) {
            if (payload.action === 'propose') this.evaluateTask(payload);
        } else if (topic.startsWith(CONFIG.TOPIC_BID)) {
            // Winner assignment broadcast by Architect
            if (payload.action === 'assign' && payload.winner === this.agentId) {
                this.executeTask(payload);
            }
        }
    }

    evaluateTask(taskPayload) {
        const myScore = this.reputation.getScore(this.agentId);
        // Simple cost model: word count * rate, floored at 1
        const costEstimate = Math.max(1, (taskPayload.context || '').split(' ').length * 0.05);

        if (myScore - costEstimate > 0) {
            this.publishSigned(`${CONFIG.TOPIC_BID}/${taskPayload.taskId}`, { 
                action: 'submit_bid', 
                taskId: taskPayload.taskId, 
                cost: costEstimate, 
                score: myScore 
            });
        }
    }

    async executeTask(taskPayload) {
        console.log(`[${this.agentId}] Executing subtask...`);
        
        // Feature 28 - Vector Embedded RAG Context 
        const engineeredPrompt = injectRAGContext(taskPayload.context);

        const llmPayload = await askLLM(
            engineeredPrompt, 
            `You are a Scholar Agent. You output strictly formatted logical blocks assessing given subtasks without disclaimers.`, 
            this.isElite
        );

        saveToRAGMemory(llmPayload);

        const resultHash = crypto.createHash('sha256').update(llmPayload).digest('hex');

        console.log(`[${this.agentId}] Computation complete. Broadcasting results to mesh.`);
        
        this.reputation.tasksCompleted++;

        this.publishSigned(`${CONFIG.TOPIC_RESULT}/${taskPayload.taskId}`, { 
            action: 'result', 
            taskId: taskPayload.taskId, 
            result: llmPayload,
            hash: resultHash
        });
    }
}
