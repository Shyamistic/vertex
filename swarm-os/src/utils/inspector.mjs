import readline from 'node:readline';
import { LivenessMonitor } from '../agent/liveness.mjs';
import { isAgentQuarantined } from '../economy/slasher.mjs';

/**
 * Developer Clarity Feature 50
 * Interactive REPL designed to tap the Swarm without taking down the node process natively.
 */
export function spawnCLIInspector(activePeersMap, architectAgentInstance) {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
        prompt: 'OmniSwarm> '
    });

    console.log(`\x1b[36mInspector REPL Active. Commands: status, scores, kill <id>, revive <id>\x1b[0m`);
    rl.prompt();

    rl.on('line', (line) => {
        const args = line.trim().split(' ');
        const cmd = args[0];

        switch(cmd) {
            case 'status':
                console.log(`\n--- ACTIVE LIVENESS MESH ---`);
                for (const [id, peer] of activePeersMap.entries()) {
                    const qFlags = isAgentQuarantined(id) ? ' [QUARANTINED]' : '';
                    console.log(`Node: ${id} | BaseRole: ${peer.role} | Status: ${peer.status}${qFlags}`);
                }
                break;
            case 'scores':
                if (architectAgentInstance) {
                    console.log(`\n--- DECENTRALIZED ECONOMY SCORES ---`);
                    const table = architectAgentInstance.reputation.scores;
                    for (const [id, score] of table.entries()) {
                        console.log(`Agent ${id} => Trust Credit: ${score.toFixed(2)}`);
                    }
                }
                break;
            case 'kill':
                if (args[1] && activePeersMap.has(args[1])) {
                    activePeersMap.get(args[1]).status = 'DEAD';
                    console.log(`[Inspector] FORCED KILL on ${args[1]}`);
                    if(architectAgentInstance) architectAgentInstance.onPeerDead(args[1]);
                }
                break;
            case 'revive':
                if (args[1] && activePeersMap.has(args[1])) {
                    activePeersMap.get(args[1]).status = 'ACTIVE';
                    console.log(`[Inspector] FORCED REVIVE on ${args[1]}`);
                }
                break;
        }
        rl.prompt();
    });
}
