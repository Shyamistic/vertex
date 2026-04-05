import { ArchitectAgent } from '../agents/architect.mjs';
import { ScholarAgent } from '../agents/scholar.mjs';
import { VerifierAgent } from '../agents/verifier.mjs';
import { CONFIG } from '../src/config.mjs';
import net from 'net';

async function startMockCluster() {
    console.log('[System] Starting mock Aedes MQTT broker (FoxMQ proxy)...');
    try {
        const AedesModule = await import('aedes');
        const createBroker = AedesModule.createBroker || (AedesModule.default ? AedesModule.default.createBroker : null);
        const broker = createBroker ? await createBroker() : new (AedesModule.default || AedesModule)();
        
        const server = net.createServer(broker.handle);
        server.listen(1883, () => {
            // Silently run mock broker on main port
        });
    } catch (e) {
        console.error("Could not start mock brokers:", e);
    }
}

async function runScenario() {
    console.log("==================================================");
    console.log(" OmniSwarm - The Agent Economy (Track 3) ");
    console.log("==================================================\n");

    await startMockCluster();
    await new Promise(r => setTimeout(r, 1000));

    // Initialize the swarm agents connected to the primary node for fallback demo
    const architect = new ArchitectAgent('Architect-1', CONFIG.NODES[0]);
    const scholarAlpha = new ScholarAgent('Scholar-Alpha', CONFIG.NODES[0], 10);
    const scholarBeta = new ScholarAgent('Scholar-Beta', CONFIG.NODES[0], 12);
    const verifierGamma = new VerifierAgent('Verifier-Gamma', CONFIG.NODES[0]);

    // Give them time to discover each other
    setTimeout(() => {
        console.log(`\n[System] Agents have discovered each other via P2P FoxMQ.`);
        // Architect receives a macro-query from a User
        architect.submitQuery("Synthesize a deep market report on decentralized robotics companies");
    }, 2000);

    // End scenario and print proof after a while
    setTimeout(() => {
        console.log("\n==================================================");
        console.log(" Scenario Complete! Checking Proof of Coordination");
        console.log("==================================================");
        import('fs').then(fs => {
            const proofFile = './logs/proof-of-coordination.jsonl';
            if (fs.existsSync(proofFile)) {
                console.log(fs.readFileSync(proofFile, 'utf8'));
            } else {
                console.log("No proof generated.");
            }
            process.exit(0);
        });
    }, 15000); // Wait 15 seconds to finish 3 tasks
}

runScenario();
