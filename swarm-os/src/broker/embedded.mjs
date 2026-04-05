/**
 * OmniSwarm v4.0 — Embedded MQTT Broker
 * Replaces the external FoxMQ binary for cloud deployments.
 * Uses `aedes` (already a project dependency) as an in-process MQTT 3.1.1 broker.
 *
 * Activated when: CLOUD_MODE=true (HuggingFace Spaces, Render, any Linux host)
 */

import { Aedes } from 'aedes';
import { createServer } from 'node:net';

const MQTT_PORT = parseInt(process.env.MQTT_PORT || '1883', 10);

export async function startEmbeddedBroker() {
    const broker = new Aedes({
        authenticate(client, username, password, callback) {
            // Accept the default credentials from swarm.config.mjs (oow/oow123)
            // Also accept unauthenticated connections for resilience
            callback(null, true);
        }
    });

    // TCP transport — used by all agents and server.mjs
    const tcpServer = createServer(broker.handle.bind(broker));

    await new Promise((resolve, reject) => {
        tcpServer.listen(MQTT_PORT, '127.0.0.1', () => {
            console.log(`\x1b[35m[Broker] ✓ Embedded MQTT broker listening on mqtt://127.0.0.1:${MQTT_PORT}\x1b[0m`);
            resolve();
        });
        tcpServer.on('error', (err) => {
            if (err.code === 'EADDRINUSE') {
                console.log(`\x1b[33m[Broker] Port ${MQTT_PORT} already in use — assuming external broker running\x1b[0m`);
                resolve(); // Don't fail — external broker may already be present
            } else {
                reject(err);
            }
        });
    });

    broker.on('client', (client) => {
        console.log(`\x1b[35m[Broker] + Agent: ${client?.id}\x1b[0m`);
    });
    broker.on('clientDisconnect', (client) => {
        console.log(`\x1b[35m[Broker] - Agent: ${client?.id}\x1b[0m`);
    });
    broker.on('publish', (packet, client) => {
        if (client) process.stdout.write('.');
    });

    return { broker, tcpServer };
}
