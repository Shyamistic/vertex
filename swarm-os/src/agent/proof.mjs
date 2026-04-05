import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

export class ProofOfCoordination {
    constructor() {
        this.logFile = path.join(process.cwd(), 'logs', 'proof-of-coordination.jsonl');
        this.lastHash = 'genesis';
        this.loadLastHash();
    }

    loadLastHash() {
        if (fs.existsSync(this.logFile)) {
            try {
                const logs = fs.readFileSync(this.logFile, 'utf8').trim().split('\n');
                if (logs.length > 0) {
                    const lastEntry = JSON.parse(logs[logs.length - 1]);
                    this.lastHash = lastEntry.hash;
                }
            } catch (e) {
                console.error("Could not load last hash", e);
            }
        }
    }

    appendProof(taskData, executionResult, verificationVotes) {
        const payload = {
            taskId: taskData.taskId,
            taskContext: taskData.context,
            winner: taskData.assignedTo,
            result: executionResult,
            votes: verificationVotes,
            previousHash: this.lastHash,
            timestamp: Date.now()
        };

        const canonical = JSON.stringify(payload, Object.keys(payload).sort());
        const hash = crypto.createHash('sha256').update(canonical).digest('hex');
        
        const entry = { ...payload, hash };
        
        fs.appendFileSync(this.logFile, JSON.stringify(entry) + '\n', 'utf8');
        this.lastHash = hash;

        return hash;
    }
}
