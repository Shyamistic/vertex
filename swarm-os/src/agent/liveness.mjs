export class LivenessMonitor {
    constructor() {
        this.table = new Map(); // agentId -> { misses, lastSeen, status }
    }

    recordHeartbeat(agentId, score) {
        this.table.set(agentId, {
            misses: 0,
            lastSeen: Date.now(),
            status: 'ACTIVE',
            score: score
        });
    }

    tick() {
        const now = Date.now();
        const changes = [];
        for (const [id, agent] of this.table.entries()) {
            if (now - agent.lastSeen > 2500) {
                agent.misses++;
                agent.lastSeen = now; // reset relative
                
                if (agent.misses >= 5 && agent.status !== 'DEAD') {
                    agent.status = 'DEAD';
                    changes.push({ id, status: 'DEAD' });
                } else if (agent.misses >= 3 && agent.status !== 'SUSPECT') {
                    agent.status = 'SUSPECT';
                    changes.push({ id, status: 'SUSPECT' });
                }
            }
        }
        return changes; // Events to fire logic upon
    }

    getReport() {
        return Array.from(this.table.entries()).map(([id, a]) => ({ id, ...a }));
    }
}
