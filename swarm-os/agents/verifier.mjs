import { OmniAgent } from '../src/agent/core.mjs';
import { CONFIG } from '../src/config.mjs';
import { ProofOfCoordination } from '../src/agent/proof.mjs';
import { askLLM } from '../src/agent/llm.mjs';

export class VerifierAgent extends OmniAgent {
    constructor(agentId, nodeUrl, isElite = false) {
        super(agentId, nodeUrl);
        this.isElite = isElite;
        this.proofChain = new ProofOfCoordination();
        this.verifyingTasks = new Map();
    }

    onCustomMessage(topic, payload) {
        if (topic.startsWith(CONFIG.TOPIC_RESULT)) {
            this.handleResult(payload);
        } else if (topic.startsWith(CONFIG.TOPIC_VERIFY)) {
            this.handleVote(payload);
        } else if (topic.startsWith(CONFIG.TOPIC_TASK)) {
            // Track contexts to know what we are verifying later
            this.verifyingTasks.set(payload.taskId, {
                context: payload.context,
                votes: []
            });
        }
    }

    async handleResult(payload) {
        if (!this.verifyingTasks.has(payload.taskId)) return;
        const task = this.verifyingTasks.get(payload.taskId);
        
        console.log(`[${this.agentId}] Cross-checking result of ${payload.taskId.substring(0,6)} from Scholar ${payload.sender}...`);

        try {
            // Cognitive Hallucination verification
            const prompt = `Evaluate if this LLM output answers the task "${task.context}". Output EXACTLY "VALID" if it is good and logical, or "INVALID" if it hallucinates or is blank. Here is the output: "${payload.data}"`;
            const check = await askLLM(prompt, "You are a harsh fact-checking AI in a decentralized protocol.", this.isElite);
            
            const isValid = check.includes('VALID') && !check.includes('INVALID');
            
            // Log vote
            task.votes.push({
                verifier: this.agentId,
                valid: isValid,
                signature: payload.sig // storing the result sig
            });

            this.publishSigned(`${CONFIG.TOPIC_VERIFY}/${payload.taskId}`, {
                action: 'vote',
                taskId: payload.taskId,
                scholar: payload.sender,
                valid: isValid
            });

            // Adjust reputation based on cognitive assessment
            if (isValid) {
                console.log(`[${this.agentId}] Verified ${payload.sender}'s work natively via AI -> GOOD.`);
                this.reputation.reward(payload.sender, 10, 5);
            } else {
                console.log(`[${this.agentId}] Verified ${payload.sender}'s work natively via AI -> HALLUCINATION DENIED.`);
                this.reputation.penalize(payload.sender, 25); // Heavy penalty for hallucinations
            }

            // Generate Proof of Coordination (Wait slightly for other votes)
            setTimeout(() => this.compileProof(payload.taskId, payload), 2000);

        } catch (e) {
            console.error(`[${this.agentId}] Verification Error:`, e);
        }
    }

    handleVote(payload) {
        if (!this.verifyingTasks.has(payload.taskId)) return;
        this.verifyingTasks.get(payload.taskId).votes.push({
            verifier: payload.sender,
            valid: payload.valid
        });
    }

    compileProof(taskId, executionResult) {
        const task = this.verifyingTasks.get(taskId);
        if (task.proofGenerated) return; // Only do it once per verifier
        task.proofGenerated = true;

        const taskData = {
            taskId,
            context: task.context,
            assignedTo: executionResult.sender
        };

        const hash = this.proofChain.appendProof(taskData, executionResult.data, task.votes);
        
        console.log(`[${this.agentId}] Generated PROOF for ${taskId.substring(0,6)} => Hash: ${hash}`);

        this.publishSigned(`${CONFIG.TOPIC_PROOF}/${taskId}`, {
            action: 'proof',
            taskId,
            hash
        });
    }
}
