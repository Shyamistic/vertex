/**
 * OmniSwarm v4.0 — Dashboard Observer Server
 * Wires all physics monitors, game-theory engines, and economy trackers.
 * Serves 8 new Socket.IO events for the mathematics dashboard panels.
 */

import express from 'express';
import { createServer } from 'node:http';
import { Server } from 'socket.io';
import mqtt from 'mqtt';
import { CONFIG } from '../../config/swarm.config.mjs';
import path from 'node:path';
import { exec } from 'node:child_process';
import { verifySignature } from '../security/identity.mjs';

// ── Physics Monitors ─────────────────────────────────────────
import { LyapunovMonitor }       from '../physics/lyapunov.mjs';
import { ThermodynamicMonitor }  from '../physics/thermodynamics.mjs';
import { PercolationMonitor }    from '../physics/percolation.mjs';
import { LaplacianAnalyzer }     from '../physics/laplacian.mjs';
import { EpidemicMonitor }       from '../physics/epidemic.mjs';
import { ChaosMonitor }          from '../physics/chaos.mjs';

// ── Game Theory Engines ──────────────────────────────────────
import { BNEDetector }           from '../game_theory/bne_detector.mjs';
import { VCGMechanism }          from '../game_theory/vcg.mjs';
import { ParetoNashAllocator }   from '../game_theory/pareto_nash.mjs';

// ── Economy Tracker ──────────────────────────────────────────
import { EconomicVelocityTracker } from '../economy/velocity.mjs';

const app    = express();
const server = createServer(app);
const io     = new Server(server, { cors: { origin: '*' } });

app.use(express.json());
app.use(express.static(path.join(process.cwd(), 'public')));

const client = mqtt.connect(CONFIG.NODES[0]);

// ── State ────────────────────────────────────────────────────
const agents = new Map();
const tasks  = new Map();
const swarmMetrics = {
    slashes: 0, proofs: 0, replays_blocked: 0,
    tasks_verified: 0, total_events: 0, tps_window: []
};

// ── Monitor Instances ────────────────────────────────────────
const lyapunov    = new LyapunovMonitor();
const thermo      = new ThermodynamicMonitor();
const percolation = new PercolationMonitor();
const laplacian   = new LaplacianAnalyzer();
const epidemic    = new EpidemicMonitor();
const chaos       = new ChaosMonitor();
const bne         = new BNEDetector();
const vcg         = new VCGMechanism();
const pne         = new ParetoNashAllocator(CONFIG.PNE_WEIGHTS);
const velocity    = new EconomicVelocityTracker();

// TPS counter
setInterval(() => {
    const now = Date.now();
    swarmMetrics.tps_window = swarmMetrics.tps_window.filter(t => now - t < 1000);
    io.emit('tps', swarmMetrics.tps_window.length);
}, 500);

// Dead agent sweeper
setInterval(() => {
    const now = Date.now();
    for (const [, ag] of agents.entries()) {
        if (ag.status === 'ACTIVE' && now - (ag.lastSeen || 0) > 10000) {
            ag.status = 'DEAD';
        }
    }
    // Feed physics monitors
    percolation.updateTopology(agents);
}, 3000);

client.on('connect', () => {
    console.log('\x1b[36m[Dashboard] Connected to FoxMQ. Observing P2P mesh + Physics Engines...\x1b[0m');
    client.subscribe('omniswarm/#');
    thermo.setActiveAgents(agents.size || 1);
});

client.on('message', (topic, message) => {
    try {
        const envelope = JSON.parse(message.toString());

        // Edge verification
        if (!verifySignature(envelope.payload, envelope.ed25519_sig, envelope.public_key)) return;

        const payload  = envelope.payload;
        const sender   = envelope.agent_id;

        // Track TPS
        swarmMetrics.total_events++;
        swarmMetrics.tps_window.push(Date.now());
        thermo.recordMessage();

        // Emit raw event log
        const topicPart = topic.split('/')[1] || topic;
        io.emit('event_log', { event_type: topicPart, agent_id: sender, payload_hash: envelope.hmac });

        // ── STATE MACHINE ──────────────────────────────────────
        if (topic.startsWith(CONFIG.TOPIC_HELLO) || topic.startsWith(CONFIG.TOPIC_STATE)) {
            if (!agents.has(sender)) {
                agents.set(sender, { id: sender, role: payload.role || sender.split('-')[0], score: payload.score || 50, status: 'ACTIVE', lastSeen: Date.now() });
            } else {
                const ag = agents.get(sender);
                ag.status = 'ACTIVE';
                ag.lastSeen = Date.now();
                if (payload.score !== undefined) ag.score = payload.score;
                if (payload.role)  ag.role  = payload.role;
            }
            // Feed Lyapunov monitor with current score
            const ag = agents.get(sender);
            if (ag) lyapunov.recordScore(sender, ag.score);
            thermo.setActiveAgents(agents.size);

        } else if (topic.startsWith(CONFIG.TOPIC_TASK) && payload.action === 'propose') {
            tasks.set(payload.taskId, { id: payload.taskId, context: payload.context, status: 'BIDDING', winner: null, startTime: Date.now() });
            thermo.recordTaskInjection();
            epidemic.addTask();
            velocity.recordEscrowLock(payload.credit || CONFIG.DEFAULT_CREDIT_ESCROW);

        } else if (topic.startsWith(CONFIG.TOPIC_BID) && payload.action === 'assign') {
            if (tasks.has(payload.taskId)) {
                const t = tasks.get(payload.taskId);
                t.status = 'EXECUTING';
                t.winner = payload.winner;
            }
            lyapunov.recordTaskAssignment(payload.winner || sender);

        } else if (topic.startsWith(CONFIG.TOPIC_RESULT)) {
            if (tasks.has(payload.taskId)) {
                tasks.get(payload.taskId).status = 'VERIFYING';
                // Record completion time for chaos monitor
                const t = tasks.get(payload.taskId);
                if (t.startTime) chaos.recordCompletionTime(Date.now() - t.startTime);
            }

        } else if (topic.startsWith(CONFIG.TOPIC_VERIFY)) {
            if (tasks.has(payload.taskId)) {
                const isValid = payload.verdict === 'VALID';
                tasks.get(payload.taskId).status = isValid ? 'VERIFIED' : 'FAILED';
                if (isValid) {
                    swarmMetrics.tasks_verified++;
                    thermo.recordTaskCompletion();
                    epidemic.recordRecovery(payload.taskId);
                    velocity.recordSettlement(payload.payout?.scholar?.amount || 35, 5);
                } else {
                    swarmMetrics.slashes++;
                    epidemic.recordContamination(payload.taskId, payload.scholar_id || sender);
                }
            }
        } else if (topic.startsWith(CONFIG.TOPIC_PROOF)) {
            swarmMetrics.proofs++;
        }

    } catch (e) { /* parse error */ }
});

// ── State broadcast (500ms) ──────────────────────────────────
setInterval(() => {
    io.emit('swarm_state', {
        agents:  Object.fromEntries(agents),
        tasks:   Object.fromEntries(tasks),
        metrics: swarmMetrics
    });
}, 500);

// ── Physics broadcasts (2s) ───────────────────────────────────
setInterval(() => {
    const lyapStats = lyapunov.compute();
    io.emit('lyapunov_update', {
        ...lyapStats,
        history: lyapunov.getHistory(30)
    });

    const thermoState = thermo.computeEntropy();
    const heatDeath   = thermo.predictHeatDeath();
    io.emit('entropy_update', { ...thermoState, ...heatDeath });

    const epidemicState = epidemic.computeSIR();
    io.emit('epidemic_update', epidemicState);

    io.emit('game_theory_update', {
        bne:  bne.getStats(),
        vcg:  vcg.getStats(),
        pne:  pne.getStats()
    });

    const percoStats = percolation.computeThreshold();
    io.emit('percolation_update', percoStats);

    const agentIds = Array.from(agents.keys()).filter(id => agents.get(id).status !== 'DEAD');
    if (agentIds.length >= 2) {
        const fieldlerStats = laplacian.assess(agentIds);
        io.emit('laplacian_update', { ...fieldlerStats, history: laplacian.getHistory(30) });
    }

    const velStats = velocity.computeVelocity();
    io.emit('velocity_update', velStats);

    const chaosStats = chaos.computeEWS();
    io.emit('chaos_update', { ...chaosStats, history: chaos.getHistory(30) });
}, 2000);

// ── HTTP API ──────────────────────────────────────────────────
app.get('/api/stats', (req, res) => {
    res.json({ agents: Array.from(agents.values()), tasks: Array.from(tasks.values()), metrics: swarmMetrics });
});

app.get('/api/physics', (req, res) => {
    res.json({
        lyapunov:     lyapunov.getStats(),
        thermodynamics: thermo.getStats(),
        percolation:  percolation.getStats(),
        laplacian:    laplacian.getStats(),
        epidemic:     epidemic.getStats(),
        chaos:        chaos.getStats(),
        velocity:     velocity.getStats(),
        game_theory:  { bne: bne.getStats(), vcg: vcg.getStats(), pne: pne.getStats() }
    });
});

app.get('/api/export-artifacts', async (req, res) => {
    const { promises: fs2 } = await import('node:fs');
    const outZip = path.join(process.cwd(), 'artifacts', `proof_bundle_${Date.now()}.zip`);
    const inDir  = path.join(process.cwd(), 'artifacts');

    const lStats = lyapunov.getStats();
    const eStats = epidemic.getStats();

    await fs2.writeFile(
        path.join(inDir, 'swarm_session_summary.json'),
        JSON.stringify({
            session_time: new Date().toISOString(),
            agents: Object.fromEntries(agents),
            tasks_total: tasks.size,
            tasks_completed: Array.from(tasks.values()).filter(t => t.status === 'VERIFIED').length,
            physics_report: {
                lyapunov: lStats,
                thermodynamics: thermo.getStats(),
                percolation: percolation.getStats(),
                laplacian: laplacian.getStats(),
                epidemic: eStats,
                chaos: chaos.getStats(),
                velocity: velocity.getStats()
            },
            game_theory: { bne: bne.getStats(), vcg: vcg.getStats(), pne: pne.getStats() },
            version: '4.0.0'
        }, null, 2)
    );

    exec(`powershell Compress-Archive -Path "${inDir}\\*" -DestinationPath "${outZip}" -Force`, (err) => {
        if (err) {
            return res.json({ error: 'Compression fallback — serving JSON summary', agents: Array.from(agents.values()), tasks: Array.from(tasks.values()) });
        }
        res.download(outZip, 'omniswarm_v4_proof_bundle.zip');
    });
});

app.post('/kill/:agentId', (req, res) => {
    const agentId = req.params.agentId;
    client.publish(`system/kill/${agentId}`, JSON.stringify({ action: 'DIE' }), { qos: 1 });
    res.json({ success: true, target: agentId });
});

server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') console.error('[Dashboard] Port 3000 busy — taskkill /F /IM node.exe');
    else console.error('[Dashboard] Server error:', err);
});

const PORT = parseInt(process.env.PORT || '3000', 10);
server.listen(PORT, '0.0.0.0', () => {
    console.log(`\x1b[32m[Dashboard] ✓ OmniSwarm v4.0 Live at http://0.0.0.0:${PORT}\x1b[0m`);
    console.log(`\x1b[32m[Dashboard] ✓ Physics API at http://0.0.0.0:${PORT}/api/physics\x1b[0m`);
});
