import { spawn } from 'node:child_process';
import path from 'node:path';

const asciiArt = `
 ██████╗ ███╗   ███╗███╗   ██╗██╗███████╗██╗    ██╗ █████╗ ██████╗ ███╗   ███╗
██╔═══██╗████╗ ████║████╗  ██║██║██╔════╝██║    ██║██╔══██╗██╔══██╗████╗ ████║
██║   ██║██╔████╔██║██╔██╗ ██║██║███████╗██║ █╗ ██║███████║██████╔╝██╔████╔██║
██║   ██║██║╚██╔╝██║██║╚██╗██║██║╚════██║██║███╗██║██╔══██║██╔══██╗██║╚██╔╝██║
╚██████╔╝██║ ╚═╝ ██║██║ ╚████║██║███████║╚███╔███╔╝██║  ██║██║  ██║██║ ╚═╝ ██║
 ╚═════╝ ╚═╝     ╚═╝╚═╝  ╚═══╝╚═╝╚══════╝ ╚══╝╚══╝ ╚═╝  ╚═╝╚═╝  ╚═╝╚═╝     ╚═╝
[Vertex Track 3 Edition] Leaderless Agent Coordination
`;

console.log(`\x1b[36m${asciiArt}\x1b[0m`);
console.log(`\x1b[33m[1/4] Booting FoxMQ Byzantine Vault...\x1b[0m`);
const rootPath = process.cwd();

// Spawn FoxMQ
const foxmq = spawn('powershell', ['-ExecutionPolicy', 'Bypass', '-File', path.join(rootPath, 'demo', 'setup-cluster.ps1')], { stdio: 'ignore' });

// Spawn Server
console.log(`\x1b[33m[2/4] Starting Glassmorphism Dashboard Observer (port 3000)...\x1b[0m`);
const server = spawn('node', [path.join(rootPath, 'src', 'panel', 'server.mjs')], { stdio: 'inherit' });

setTimeout(() => {
    console.log(`\x1b[33m[3/4] Generating Massive 5000+ Deterministic Shards for Economic Competition...\x1b[0m`);
    // Run Massive Scenario natively integrating the explicit Track 3 flags
    const demo = spawn('node', [path.join(rootPath, 'demo', 'mass-scenario.mjs'), '--self-healing-drill', '--fault-mode', 'delay', '--fault-rate', '0.2'], { stdio: 'inherit' });
    
    console.log(`\x1b[32m[4/4] System is LIVE. Open your browser to http://localhost:3000 to watch the society compute!\x1b[0m`);
}, 3000);

process.on('SIGINT', () => {
    console.log("\x1b[31mShutting down mesh...\x1b[0m");
    server.kill();
    // Kill child foxmq natively
    spawn('powershell', ['-Command', 'taskkill /IM foxmq.exe /F; taskkill /IM node.exe /F']);
    process.exit();
});
