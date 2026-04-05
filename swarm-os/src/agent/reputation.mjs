import fs from 'fs';
import path from 'path';
import { CONFIG } from '../../config/swarm.config.mjs';

export class ReputationSystem {
    constructor(agentId) {
        this.agentId = agentId;
        this.scores = new Map();
        
        // Add analytical tracking properties
        this.tasksWon = 0;
        this.tasksCompleted = 0;
        this.hallucinations = 0;
        this.slashes = 0;
        this.lastDecayTime = Date.now();
        
        const dataDir = path.join(process.cwd(), 'data');
        if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
        
        this.dataFile = path.join(dataDir, `reputation_${agentId}.json`);
        this.load();
    }

    load() {
        if (fs.existsSync(this.dataFile)) {
            try {
                const data = JSON.parse(fs.readFileSync(this.dataFile, 'utf8'));
                for (const [id, score] of Object.entries(data)) {
                    this.scores.set(id, score);
                }
            } catch (e) {
                console.error('Failed to load reputation data', e);
            }
        }
    }

    save() {
        const data = Object.fromEntries(this.scores);
        fs.writeFileSync(this.dataFile, JSON.stringify(data, null, 2), 'utf8');
    }

    getScore(id) {
        if (!this.scores.has(id)) {
            this.scores.set(id, 50); // Default score is 50
        }
        return this.scores.get(id);
    }

    reward(id, points = 10, qualityBonus = 0) {
        let score = this.getScore(id);
        score = Math.min(100, score + points + qualityBonus);
        this.scores.set(id, score);
        this.save();
    }

    penalize(id, points = 15) {
        let score = this.getScore(id);
        score = Math.max(0, score - points);
        this.scores.set(id, score);
        this.save();
    }

    isTrusted(id) {
        return this.getScore(id) >= 20; // Critical threshold
    }

    decay() {
        const now = Date.now();
        if (now - this.lastDecayTime < 30000) return; // Feature 19 specifies 30s intervals
        
        for (const [id, score] of this.scores.entries()) {
            if (score > 10) {
                const decayed = Math.max(10, score * CONFIG.REPUTATION_DECAY_RATE);
                this.scores.set(id, decayed);
            }
        }
        
        this.lastDecayTime = now;
        this.save();
    }
}
