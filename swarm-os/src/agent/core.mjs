import mqtt from 'mqtt';
import { CONFIG } from '../../config/swarm.config.mjs';
import { packEnvelope } from '../security/envelope.mjs';
import { ReplayCache } from '../security/replay.mjs';
import { verifySignature } from '../security/identity.mjs';
import { LivenessMonitor } from './liveness.mjs';
import { ReputationSystem } from './reputation.mjs';

export class OmniAgent {
    constructor(agentId, nodeUrl) {
        this.agentId = agentId;
        this.nodeUrl = nodeUrl;
        this.reputation = new ReputationSystem(agentId);
        this.peers = new Map();
        this.liveness = new LivenessMonitor();
        this._replayCache = new ReplayCache(); // Per-agent instance — avoids cross-agent nonce poisoning
        
        console.log(`[${this.agentId}] Connecting to FoxMQ Node: ${nodeUrl}`);
        this.client = mqtt.connect(nodeUrl);
        
        this._deadPeers = new Set(); // Track already-known-dead peers to suppress repeat alerts

        this.client.on('connect', () => {
            console.log(`[${this.agentId}] Connected!`);
            this.client.subscribe(`${CONFIG.TOPIC_HELLO}/#`);
            this.client.subscribe(`${CONFIG.TOPIC_STATE}/#`);
            this.client.subscribe(`${CONFIG.TOPIC_TASK}/#`);
            this.client.subscribe(`${CONFIG.TOPIC_BID}/#`);
            this.client.subscribe(`${CONFIG.TOPIC_RESULT}/#`);
            this.client.subscribe(`${CONFIG.TOPIC_VERIFY}/#`);
            this.client.subscribe(`${CONFIG.TOPIC_PROOF}/#`);
            this.client.subscribe(`${CONFIG.TOPIC_HIVE}/#`);
            this.client.subscribe(`system/kill/${this.agentId}`);
            
            this.publishHello();
            setInterval(() => this.publishState(), CONFIG.HEARTBEAT_INTERVAL_MS);
            
            // Sweeper for dead peers — fires once per peer, then suppressed
            setInterval(() => {
                const events = this.liveness.tick();
                for (const ev of events) {
                    if (this.peers.has(ev.id)) {
                        this.peers.get(ev.id).status = ev.status;
                    }
                    if (ev.status === 'DEAD' && !this._deadPeers.has(ev.id)) {
                        this._deadPeers.add(ev.id); // Mark as known-dead — suppress future alerts
                        console.log(`[${this.agentId}] [SWARM-DEFENSE] Peer ${ev.id} triggered DEAD threshold.`);
                        this.onPeerDead(ev.id);
                    }
                }
            }, 5000);
        });

        this.client.on('message', (topic, message) => {
            try {
                const payload = JSON.parse(message.toString());
                
                // Demo self-healing kill-switch listener
                if (topic === `system/kill/${this.agentId}` && payload.action === 'DIE') {
                    console.log(`[!] ${this.agentId} KILLED INTERNALLY FOR FAULT INJECTION DEMO.`);
                    this.client.end(); // completely sever network so it misses heartbeats
                    return;
                }

                // Per-agent anti-replay check
                if (this._replayCache.isReplay(payload.nonce, payload.timestamp_ms)) {
                    return; // Stale or duplicate
                }

                // Envelope Ed25519 authentication verify
                if (!verifySignature(payload.payload, payload.ed25519_sig, payload.public_key)) {
                    console.log(`[${this.agentId}] Rejected message on ${topic}: Invalid Ed25519 signature envelope.`);
                    return;
                }
                
                this.handleMessage(topic, payload.payload, payload.agent_id);
            } catch (e) {
                // Parse error
            }
        });
    }

    async publishSigned(topic, payloadObj) {
        const envelope = await packEnvelope(this.agentId, topic.split('/')[1], payloadObj);
        this.client.publish(topic, JSON.stringify(envelope), { qos: 1 });
    }

    publishHello() {
        this.publishSigned(`${CONFIG.TOPIC_HELLO}/${this.agentId}`, { action: 'hello', role: this.constructor.name });
    }

    publishState() {
        // Feature 19 - Reputation Decay Function happens here lazily
        this.reputation.decay(); 
        this.publishSigned(`${CONFIG.TOPIC_STATE}/${this.agentId}`, { action: 'heartbeat', score: this.reputation.getScore(this.agentId) });
    }

    handleMessage(topic, innerPayload, senderId) {
        if (senderId === this.agentId) return; // Ignore self

        if (topic.startsWith(CONFIG.TOPIC_HELLO)) {
            this.peers.set(senderId, { status: 'ACTIVE', role: innerPayload.role });
            this.liveness.recordHeartbeat(senderId, 50);
            this._deadPeers.delete(senderId); // Re-activate: clear dead flag if peer reconnects
        } else if (topic.startsWith(CONFIG.TOPIC_STATE)) {
            if (this.peers.has(senderId)) {
                this.liveness.recordHeartbeat(senderId, innerPayload.score);
                this._deadPeers.delete(senderId); // Heartbeat seen — no longer dead
            }
        } else {
            this.onCustomMessage(topic, innerPayload, senderId);
        }
    }

    // To be overridden by subclasses
    onCustomMessage(topic, payload) {}
    onPeerDead(deadAgentId) {}
}
