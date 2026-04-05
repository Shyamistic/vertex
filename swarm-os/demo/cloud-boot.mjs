/**
 * OmniSwarm v4.0 — Cloud Boot Entry Point
 * Single-process launcher for HuggingFace Spaces / Render / any Linux host.
 *
 * Boot order:
 *   1. Embedded aedes MQTT broker (replaces FoxMQ binary)
 *   2. Dashboard observer server (Express + Socket.IO)
 *   3. Mass scenario agents
 *
 * Usage:
 *   CLOUD_MODE=true node demo/cloud-boot.mjs
 *   PORT=7860 node demo/cloud-boot.mjs   (HF Spaces)
 */

import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startEmbeddedBroker } from '../src/broker/embedded.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootPath  = path.join(__dirname, '..');

const asciiArt = `
 ██████╗ ███╗   ███╗███╗   ██╗██╗███████╗██╗    ██╗ █████╗ ██████╗ ███╗   ███╗
██╔═══██╗████╗ ████║████╗  ██║██║██╔════╝██║    ██║██╔══██╗██╔══██╗████╗ ████║
██║   ██║██╔████╔██║██╔██╗ ██║██║███████╗██║ █╗ ██║███████║██████╔╝██╔████╔██║
██║   ██║██║╚██╔╝██║██║╚██╗██║██║╚════██║██║███╗██║██╔══██║██╔══██╗██║╚██╔╝██║
╚██████╔╝██║ ╚═╝ ██║██║ ╚████║██║███████║╚███╔███╔╝██║  ██║██║  ██║██║ ╚═╝ ██║
 ╚═════╝ ╚═╝     ╚═╝╚═╝  ╚═══╝╚═╝╚══════╝ ╚══╝╚══╝ ╚═╝  ╚═╝╚═╝  ╚═╝╚═╝     ╚═╝
[ CLOUD MODE — HuggingFace Spaces / Production ]
`;

console.log(`\x1b[36m${asciiArt}\x1b[0m`);

// ── Step 1: Embedded MQTT Broker ─────────────────────────────
console.log(`\x1b[33m[1/4] Starting embedded MQTT broker (aedes)...\x1b[0m`);
await startEmbeddedBroker();

// ── Step 2: Dashboard Server ──────────────────────────────────
console.log(`\x1b[33m[2/4] Starting Glassmorphism Dashboard (port ${process.env.PORT || 3000})...\x1b[0m`);

const server = spawn('node', [path.join(rootPath, 'src', 'panel', 'server.mjs')], {
    stdio: 'inherit',
    env: { ...process.env }
});

server.on('error', (err) => console.error('[Server] Failed to start:', err));

// ── Step 3: Agent Scenario (after broker + server are ready) ──
await new Promise(resolve => setTimeout(resolve, 4000));

console.log(`\x1b[33m[3/4] Launching agent population (mass scenario)...\x1b[0m`);

const demo = spawn('node', [
    path.join(rootPath, 'demo', 'mass-scenario.mjs'),
    '--self-healing-drill',
    '--fault-mode', 'delay',
    '--fault-rate', '0.2'
], {
    stdio: 'inherit',
    env: { ...process.env }
});

demo.on('error', (err) => console.error('[Demo] Agent spawn error:', err));

const port = process.env.PORT || 3000;
console.log(`\x1b[32m[4/4] ✓ OmniSwarm LIVE → http://0.0.0.0:${port}\x1b[0m`);
console.log(`\x1b[32m      Physics API  → http://0.0.0.0:${port}/api/physics\x1b[0m`);

// ── Graceful shutdown ─────────────────────────────────────────
process.on('SIGTERM', () => {
    console.log('\x1b[31m[Boot] SIGTERM received — shutting down gracefully\x1b[0m');
    server.kill('SIGTERM');
    demo.kill('SIGTERM');
    process.exit(0);
});

process.on('SIGINT', () => {
    server.kill();
    demo.kill();
    process.exit(0);
});
