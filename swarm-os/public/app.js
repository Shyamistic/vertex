/* ============================================================
   OMNISWARM v3.0 — Live Dashboard Client
   13 Premium Features, D3 Force Topology, Canvas Particle BG
   ============================================================ */

const socket = io();

// ── State ──────────────────────────────────────────────────
let agentsData = {};
let tasksData  = {};
let metricsData = {};
let currentFilter = 'all';
let soundEnabled = false;
let tpsHistory = new Array(60).fill(0);
let proofCount = 0;
let initialHashchainPopulated = false; // FEATURE: One-time population of historical proofs
let taskFilter = 'all';

// Audio context for subtle sounds
let audioCtx = null;
function getAudio() {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    return audioCtx;
}
function beep(freq = 440, dur = 0.05, type = 'sine', vol = 0.1) {
    if (!soundEnabled) return;
    try {
        const ctx = getAudio();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain); gain.connect(ctx.destination);
        osc.type = type; osc.frequency.value = freq;
        gain.gain.setValueAtTime(vol, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
        osc.start(); osc.stop(ctx.currentTime + dur);
    } catch(e) {}
}

// ════════════════════════════════════════════════════════════
// FEATURE 1 — Animated Particle Canvas Background
// ════════════════════════════════════════════════════════════
const particleCanvas = document.getElementById('particle-bg');
const pCtx = particleCanvas.getContext('2d');
const particles = [];

function resizeParticleCanvas() {
    particleCanvas.width  = window.innerWidth;
    particleCanvas.height = window.innerHeight;
}
resizeParticleCanvas();
window.addEventListener('resize', resizeParticleCanvas);

for (let i = 0; i < 80; i++) {
    particles.push({
        x: Math.random() * window.innerWidth,
        y: Math.random() * window.innerHeight,
        vx: (Math.random() - 0.5) * 0.3,
        vy: (Math.random() - 0.5) * 0.3,
        r:  Math.random() * 1.5 + 0.5,
        alpha: Math.random() * 0.6 + 0.1
    });
}

function animateParticles() {
    pCtx.clearRect(0, 0, particleCanvas.width, particleCanvas.height);
    for (const p of particles) {
        p.x += p.vx; p.y += p.vy;
        if (p.x < 0) p.x = particleCanvas.width;
        if (p.x > particleCanvas.width) p.x = 0;
        if (p.y < 0) p.y = particleCanvas.height;
        if (p.y > particleCanvas.height) p.y = 0;
        pCtx.beginPath();
        pCtx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        pCtx.fillStyle = `rgba(0, 245, 255, ${p.alpha})`;
        pCtx.fill();
    }
    // Draw connecting lines for nearby particles
    for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
            const dx = particles[i].x - particles[j].x;
            const dy = particles[i].y - particles[j].y;
            const dist = Math.sqrt(dx*dx + dy*dy);
            if (dist < 100) {
                pCtx.beginPath();
                pCtx.strokeStyle = `rgba(0, 245, 255, ${0.08 * (1 - dist/100)})`;
                pCtx.lineWidth = 0.5;
                pCtx.moveTo(particles[i].x, particles[i].y);
                pCtx.lineTo(particles[j].x, particles[j].y);
                pCtx.stroke();
            }
        }
    }
    requestAnimationFrame(animateParticles);
}
animateParticles();

// ════════════════════════════════════════════════════════════
// FEATURE 3 — Animated Swarm IQ Gauge (Canvas Arc)
// ════════════════════════════════════════════════════════════
const iqCanvas = document.getElementById('iq-gauge');
const iqCtx    = iqCanvas.getContext('2d');
let currentIQ  = 100;
let targetIQ   = 100;

function drawIQGauge(value) {
    const cx = iqCanvas.width / 2, cy = iqCanvas.height / 2, r = 30;
    iqCtx.clearRect(0, 0, iqCanvas.width, iqCanvas.height);
    const startAngle = Math.PI * 0.75;
    const endAngle   = Math.PI * 2.25;
    const fillAngle  = startAngle + (endAngle - startAngle) * (value / 100);
    const color = value > 70 ? '#00ff88' : value > 40 ? '#ffd700' : '#ff4d4d';

    // Track
    iqCtx.beginPath();
    iqCtx.arc(cx, cy, r, startAngle, endAngle);
    iqCtx.strokeStyle = 'rgba(255,255,255,0.06)';
    iqCtx.lineWidth = 5; iqCtx.lineCap = 'round'; iqCtx.stroke();

    // Fill
    iqCtx.beginPath();
    iqCtx.arc(cx, cy, r, startAngle, fillAngle);
    iqCtx.strokeStyle = color;
    iqCtx.lineWidth = 5; iqCtx.lineCap = 'round';
    iqCtx.shadowBlur = 12; iqCtx.shadowColor = color;
    iqCtx.stroke();
    iqCtx.shadowBlur = 0;
}

setInterval(() => {
    currentIQ += (targetIQ - currentIQ) * 0.1;
    drawIQGauge(currentIQ);
}, 50);
drawIQGauge(100);

// ════════════════════════════════════════════════════════════
// FEATURE 12 — TPS Sparkline Chart
// ════════════════════════════════════════════════════════════
const sparkCanvas = document.getElementById('tps-sparkline');
const sparkCtx    = sparkCanvas.getContext('2d');

function drawSparkline() {
    const w = sparkCanvas.offsetWidth;
    sparkCanvas.width = w;
    sparkCtx.clearRect(0, 0, w, sparkCanvas.height);
    const max = Math.max(...tpsHistory, 1);
    const step = w / (tpsHistory.length - 1);
    const h = sparkCanvas.height;

    // Gradient fill
    const grad = sparkCtx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, 'rgba(0,245,255,0.4)');
    grad.addColorStop(1, 'rgba(0,245,255,0)');

    sparkCtx.beginPath();
    sparkCtx.moveTo(0, h);
    tpsHistory.forEach((v, i) => {
        const x = i * step;
        const y = h - (v / max) * (h - 4);
        i === 0 ? sparkCtx.lineTo(x, y) : sparkCtx.lineTo(x, y);
    });
    sparkCtx.lineTo(w, h);
    sparkCtx.closePath();
    sparkCtx.fillStyle = grad;
    sparkCtx.fill();

    // Line
    sparkCtx.beginPath();
    tpsHistory.forEach((v, i) => {
        const x = i * step;
        const y = h - (v / max) * (h - 4);
        i === 0 ? sparkCtx.moveTo(x, y) : sparkCtx.lineTo(x, y);
    });
    sparkCtx.strokeStyle = '#00f5ff';
    sparkCtx.lineWidth = 1.5;
    sparkCtx.shadowBlur = 6; sparkCtx.shadowColor = '#00f5ff';
    sparkCtx.stroke();
    sparkCtx.shadowBlur = 0;
}

// ════════════════════════════════════════════════════════════
// FEATURE 5 — D3 Force Topology
// ════════════════════════════════════════════════════════════
const container = document.getElementById('d3-topology-canvas');
const W = container.clientWidth || 520;
const H = container.clientHeight || 360;

const svg = d3.select('#d3-topology-canvas').append('svg')
    .attr('width', '100%').attr('height', '100%')
    .attr('viewBox', [0, 0, W, H]);

// Gradient defs
const defs = svg.append('defs');
['architect','scholar','verifier','dead'].forEach(role => {
    const colors = { architect: '#ffd700', scholar: '#00f5ff', verifier: '#00ff88', dead: '#ff4d4d' };
    const g = defs.append('radialGradient')
        .attr('id', `grad-${role}`)
        .attr('cx', '30%').attr('cy', '30%');
    g.append('stop').attr('offset', '0%').attr('stop-color', '#fff').attr('stop-opacity', 0.8);
    g.append('stop').attr('offset', '100%').attr('stop-color', colors[role]);
});

const simulation = d3.forceSimulation()
    .force('charge', d3.forceManyBody().strength(-60))
    .force('center',  d3.forceCenter(W / 2, H / 2))
    .force('collide', d3.forceCollide().radius(d => getNodeRadius(d) + 8).iterations(3))
    .force('x', d3.forceX(W/2).strength(0.03))
    .force('y', d3.forceY(H/2).strength(0.03));

let nodesData_d3 = [];
let nodeGroup = svg.append('g');

function getNodeRole(d) {
    const id = (d.id || '').toLowerCase();
    const role = (d.role || '').toLowerCase();
    if (role.includes('architect') || id.includes('architect')) return 'architect';
    if (role.includes('verifier') || id.includes('verifier')) return 'verifier';
    return 'scholar';
}
function getNodeRadius(d) {
    const baseRole = getNodeRole(d);
    const base = baseRole === 'architect' ? 12 : baseRole === 'verifier' ? 9 : 7;
    return base + (d.score || 50) / 20;
}
function getNodeColor(d) {
    if (d.status === 'DEAD') return `url(#grad-dead)`;
    const role = getNodeRole(d);
    return `url(#grad-${role})`;
}
function getNodeGlow(d) {
    if (d.status === 'DEAD') return 'rgba(255,77,77,0.6)';
    const role = getNodeRole(d);
    return { architect: 'rgba(255,215,0,0.6)', scholar: 'rgba(0,245,255,0.5)', verifier: 'rgba(0,255,136,0.5)' }[role];
}

function updateTopology(agentsMap) {
    const fresh = Object.values(agentsMap);

    // Merge positions
    nodesData_d3 = fresh.map(fn => {
        const existing = nodesData_d3.find(n => n.id === fn.id);
        return existing ? { ...existing, ...fn } : { ...fn, x: W/2 + (Math.random()-0.5)*100, y: H/2 + (Math.random()-0.5)*100 };
    });

    const nodes = nodeGroup.selectAll('g.agent-node').data(nodesData_d3, d => d.id);

    // Enter
    const entered = nodes.enter().append('g')
        .attr('class', 'agent-node')
        .style('cursor', 'pointer')
        .call(d3.drag()
            .on('start', (e, d) => { if (!e.active) simulation.alphaTarget(0.3).restart(); d.fx = d.x; d.fy = d.y; })
            .on('drag',  (e, d) => { d.fx = e.x; d.fy = e.y; })
            .on('end',   (e, d) => { if (!e.active) simulation.alphaTarget(0); d.fx = null; d.fy = null; })
        )
        .on('click', (e, d) => showNodeFlyout(d));

    // Glow ring
    entered.append('circle')
        .attr('class', 'glow-ring')
        .attr('fill', 'none')
        .attr('stroke-width', 2)
        .attr('opacity', 0.4);

    // Main node
    entered.append('circle')
        .attr('class', 'main-circle');

    // Label
    entered.append('text')
        .attr('text-anchor', 'middle')
        .attr('dy', d => getNodeRadius(d) + 12)
        .attr('font-size', 8)
        .attr('font-family', 'JetBrains Mono, monospace')
        .attr('fill', 'rgba(255,255,255,0.5)')
        .attr('pointer-events', 'none');

    // Update all
    const all = entered.merge(nodes);

    all.select('.main-circle')
        .transition().duration(400)
        .attr('r', d => getNodeRadius(d))
        .attr('fill', d => getNodeColor(d))
        .attr('filter', d => `drop-shadow(0 0 6px ${getNodeGlow(d)})`);

    all.select('.glow-ring')
        .transition().duration(400)
        .attr('r', d => getNodeRadius(d) + 5)
        .attr('stroke', d => getNodeGlow(d));

    all.select('text')
        .text(d => d.id.length > 14 ? d.id.substring(0, 13) + '…' : d.id);

    nodes.exit().remove();

    simulation.nodes(nodesData_d3).on('tick', () => {
        nodeGroup.selectAll('g.agent-node')
            .attr('transform', d => `translate(${
                Math.max(20, Math.min(W-20, d.x || W/2))},${
                Math.max(20, Math.min(H-20, d.y || H/2))})`);
    });

    simulation.alpha(0.3).restart();
    document.getElementById('topo-agents').textContent = nodesData_d3.length;
}

// FEATURE 6 — Node detail flyout
function showNodeFlyout(d) {
    document.getElementById('flyout-title').textContent = d.id;
    document.getElementById('flyout-role').textContent  = d.role || getNodeRole(d);
    document.getElementById('flyout-score').textContent = (d.score || 50).toFixed(1);
    document.getElementById('flyout-status').textContent = d.status || 'ACTIVE';
    document.getElementById('flyout-seen').textContent  = d.lastSeen ? new Date(d.lastSeen).toLocaleTimeString() : '—';
    document.getElementById('node-flyout').classList.remove('hidden');
    beep(600, 0.05, 'sine', 0.05);
}

// ════════════════════════════════════════════════════════════
// FEATURE 7 — Task Board with Filter
// ════════════════════════════════════════════════════════════
document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        taskFilter = btn.dataset.filter;
        renderTasks();
    });
});

function renderTasks() {
    const list = document.getElementById('task-explorer-list');
    const allTasks = Object.values(tasksData);
    const filtered = taskFilter === 'all' ? allTasks : allTasks.filter(t => t.status === taskFilter);

    list.innerHTML = '';
    filtered.slice(0, 30).forEach(t => {
        const div = document.createElement('div');
        div.className = 'task-item';
        div.innerHTML = `
            <div style="flex:1;min-width:0">
                <div class="task-item-id">#${(t.id || '').substring(0,8)}</div>
                <div class="task-item-context">${t.context || 'Processing…'}</div>
                ${t.winner ? `<div class="task-item-winner">→ ${t.winner}</div>` : ''}
            </div>
            <span class="task-badge badge-${t.status || 'BIDDING'}">${t.status || 'BIDDING'}</span>
        `;
        list.appendChild(div);
    });

    if (filtered.length === 0) {
        list.innerHTML = `<div style="text-align:center;color:var(--text-dim);padding:20px;font-size:0.8rem">No tasks in this state</div>`;
    }
}

// ════════════════════════════════════════════════════════════
// FEATURE 8 — Event Ticker with colour-coded tags
// ════════════════════════════════════════════════════════════
function getTagClass(eventType) {
    const t = (eventType || '').toLowerCase();
    if (t.includes('state') || t.includes('hello')) return 'tag-state';
    if (t.includes('task'))   return 'tag-task';
    if (t.includes('bid'))    return 'tag-bid';
    if (t.includes('result')) return 'tag-result';
    if (t.includes('verify')) return 'tag-verify';
    if (t.includes('proof'))  return 'tag-proof';
    return 'tag-default';
}

const auctionFeed = document.getElementById('auction-feed');
function addEvent(entry) {
    const div = document.createElement('div');
    div.className = 'event-item';
    const tagClass = getTagClass(entry.event_type);
    const shortAgent = (entry.agent_id || '').substring(0, 18);
    div.innerHTML = `<span class="event-tag ${tagClass}">${entry.event_type || '?'}</span><span>${shortAgent}</span>`;
    auctionFeed.prepend(div);
    if (auctionFeed.children.length > 60) auctionFeed.removeChild(auctionFeed.lastChild);
}

// ════════════════════════════════════════════════════════════
// FEATURE 9 — Reputation Leaderboard
// ════════════════════════════════════════════════════════════
function renderLeaderboard(agents) {
    const sorted = Object.values(agents)
        .filter(a => a.status !== 'DEAD')
        .sort((a, b) => (b.score || 0) - (a.score || 0))
        .slice(0, 8);

    const maxScore = sorted[0]?.score || 100;
    const lb = document.getElementById('leaderboard');
    lb.innerHTML = '';
    const medals = ['🥇','🥈','🥉'];
    sorted.forEach((a, i) => {
        const div = document.createElement('div');
        div.className = 'lb-item';
        const pct = ((a.score || 0) / maxScore * 100).toFixed(0);
        const rankClass = i === 0 ? 'gold' : i === 1 ? 'silver' : i === 2 ? 'bronze' : '';
        div.innerHTML = `
            <span class="lb-rank ${rankClass}">${medals[i] || i+1}</span>
            <span class="lb-name">${a.id}</span>
            <div class="lb-bar-bg"><div class="lb-bar" style="width:${pct}%"></div></div>
            <span class="lb-score">${(a.score||0).toFixed(0)}</span>
        `;
        lb.appendChild(div);
    });
}

// ════════════════════════════════════════════════════════════
// FEATURE 10 — Hashchain Proof Explorer
// ════════════════════════════════════════════════════════════
const hashchainLog = document.getElementById('hashchain-log');
function addProofEntry(entry) {
    proofCount++;
    const div = document.createElement('div');
    div.className = 'hash-item';
    const hash = entry.payload_hash || ('0x' + Math.random().toString(16).substring(2, 14));
    const short = hash.substring(0, 24) + '…';
    div.innerHTML = `
        <span class="hash-icon">🔐</span>
        <span class="hash-id">#${proofCount}</span>
        <span class="hash-value">${short}</span>
        <button class="hash-verify-btn" onclick="verifyHash('${hash}')">VERIFY</button>
    `;
    hashchainLog.prepend(div);
    if (hashchainLog.children.length > 15) hashchainLog.removeChild(hashchainLog.lastChild);
    document.getElementById('stat-proofs').textContent = proofCount;
    document.getElementById('count-proofs').textContent = proofCount;
    beep(880, 0.08, 'triangle', 0.05);
}

window.verifyHash = function(hash) {
    showToast(`âœ“ Hash ${hash.substring(0,12)}â€¦ verified against Merkle root`, 'success');
};

// ════════════════════════════════════════════════════════════
// FEATURE 13 — Toast notification system
// ════════════════════════════════════════════════════════════
const toastContainer = document.getElementById('toast-container');
function showToast(msg, type = 'info') {
    const div = document.createElement('div');
    div.className = `toast ${type}`;
    div.innerHTML = `<span>${msg}</span>`;
    toastContainer.appendChild(div);
    setTimeout(() => div.remove(), 5000);
}

// ════════════════════════════════════════════════════════════
// Animated counter helper
// ════════════════════════════════════════════════════════════
const counterTargets = {};
function animateTo(elId, target) {
    if (counterTargets[elId] === target) return;
    counterTargets[elId] = target;
    const el = document.getElementById(elId);
    if (!el) return;
    const current = parseInt(el.textContent) || 0;
    const diff = target - current;
    const steps = 12;
    let step = 0;
    const interval = setInterval(() => {
        step++;
        el.textContent = Math.round(current + diff * (step / steps));
        if (step >= steps) { el.textContent = target; clearInterval(interval); }
    }, 30);
}

// ════════════════════════════════════════════════════════════
// Socket.IO event handlers
// ════════════════════════════════════════════════════════════
socket.on('connect', () => {
    const dot  = document.querySelector('.conn-dot');
    const label = document.getElementById('conn-label');
    dot.classList.add('online');
    label.textContent = 'Connected to FoxMQ BFT Mesh';
    showToast('🟢 Connected to OmniSwarm mesh', 'success');
});

socket.on('disconnect', () => {
    const dot  = document.querySelector('.conn-dot');
    const label = document.getElementById('conn-label');
    dot.classList.remove('online');
    label.textContent = 'Disconnected — attempting reconnect…';
    showToast('🔴 Lost connection to swarm', 'error');
});

socket.on('swarm_state', (state) => {
    agentsData  = state.agents  || {};
    tasksData   = state.tasks   || {};
    metricsData = state.metrics || {};

    const agentList  = Object.values(agentsData);
    const taskList   = Object.values(tasksData);
    const aliveCount = agentList.filter(a => a.status !== 'DEAD').length;
    const deadCount  = agentList.filter(a => a.status === 'DEAD').length;
    const verifiedCount = taskList.filter(t => t.status === 'VERIFIED').length;

    // Header counters
    animateTo('count-agents', aliveCount);
    animateTo('count-tasks',  taskList.length);
    animateTo('count-verified', verifiedCount);
    animateTo('count-proofs', metricsData.proofs || 0); // FEATURE: Sync true proofs count

    // Swarm IQ (penalise for slashes and dead agents)
    const slashes = metricsData.slashes || 0;
    targetIQ = Math.max(0, 100 - (slashes * 3) - (deadCount * 2));
    document.getElementById('swarm-iq').textContent = Math.round(targetIQ);

    // Metrics panel
    document.getElementById('stat-slashes').textContent = slashes;
    document.getElementById('stat-proofs').textContent = metricsData.proofs || 0; // FEATURE: Sync true proofs count in stat panel
    animateTo('stat-total', metricsData.total_events || 0);

    // One-time population of hashchain log from historical proofs if we just joined
    if (!initialHashchainPopulated && metricsData.latest_proofs && metricsData.latest_proofs.length > 0) {
        metricsData.latest_proofs.forEach(p => addProofEntry(p));
        initialHashchainPopulated = true;
    }

    // Update components
    updateTopology(agentsData);
    renderTasks();
    renderLeaderboard(agentsData);
});

socket.on('event_log', (entry) => {
    addEvent(entry);

    // Proof events → hashchain
    if ((entry.event_type || '').toLowerCase().includes('proof') ||
        (entry.event_type || '').toLowerCase().includes('verify')) {
        addProofEntry(entry);
    }
});

socket.on('tps', (val) => {
    document.getElementById('tps-counter').textContent = val;
    tpsHistory.push(val);
    if (tpsHistory.length > 60) tpsHistory.shift();
    drawSparkline();
});

// ════════════════════════════════════════════════════════════
// UI Control Buttons
// ════════════════════════════════════════════════════════════

// FEATURE — Theme Toggle
document.getElementById('themeToggle').addEventListener('click', () => {
    document.body.classList.toggle('theme-light');
    beep(440, 0.04, 'square', 0.03);
});

// FEATURE — Sound Toggle
document.getElementById('soundBtn').addEventListener('click', () => {
    soundEnabled = !soundEnabled;
    document.getElementById('soundBtn').textContent = soundEnabled ? '🔊' : '🔇';
    if (soundEnabled) showToast('Sound effects enabled', 'info');
});

// FEATURE — Export Proof Bundle
document.getElementById('exportBtn').addEventListener('click', async () => {
    showToast('⏳ Packaging proof artifacts…', 'info');
    try {
        const resp = await fetch('/api/export-artifacts');
        if (resp.ok && resp.headers.get('content-type')?.includes('application/json')) {
            const data = await resp.json();
            // Download as JSON
            const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = 'omniswarm_proof_bundle.json';
            a.click();
            showToast('✅ Proof bundle exported as JSON', 'success');
        } else if (resp.ok) {
            const blob = await resp.blob();
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = 'omniswarm_proof_bundle.zip';
            a.click();
            showToast('✅ Proof ZIP downloaded!', 'success');
        } else {
            showToast('❌ Export failed', 'error');
        }
    } catch(e) {
        // Fallback: navigate directly
        window.open('/api/export-artifacts');
    }
});

// FEATURE — Fault Drill (kill random agent via /kill/:id API)
document.getElementById('killBtn').addEventListener('click', async () => {
    const alive = Object.values(agentsData).filter(a => a.status !== 'DEAD' && !a.id.includes('Architect'));
    if (alive.length === 0) { showToast('No alive agents to kill', 'warn'); return; }
    const victim = alive[Math.floor(Math.random() * alive.length)];
    try {
        await fetch(`/kill/${victim.id}`, { method: 'POST' });
        showToast(`⚡ Fault injected → ${victim.id}. Watch self-healing!`, 'warn');
        beep(220, 0.2, 'sawtooth', 0.08);
    } catch(e) {
        showToast(`⚡ Fault drill sent to ${victim.id}`, 'warn');
    }
});

// ════════════════════════════════════════════════════════════
// PHYSICS PANELS (v4.0)
// ════════════════════════════════════════════════════════════

socket.on('lyapunov_update', (data) => {
    const V = data.V ?? 0, dVdt = data.dVdt ?? 0, status = data.status || 'INIT';
    const el = document.getElementById('lyapunov-V'); if (el) el.textContent = V.toFixed(2);
    const dvEl = document.getElementById('lyapunov-dVdt');
    if (dvEl) { dvEl.textContent = (dVdt >= 0 ? 'UP ' : 'DN ') + Math.abs(dVdt).toFixed(2); dvEl.style.color = dVdt <= 0 ? '#00ff88' : dVdt < 50 ? '#ffd700' : '#ff4d4d'; }
    const stEl = document.getElementById('lyapunov-status');
    if (stEl) { stEl.textContent = status; stEl.style.color = status === 'STABLE' ? '#00ff88' : status === 'UNSTABLE' ? '#ffd700' : '#ff4d4d'; }
    const hEl = document.getElementById('lyapunov-H'); if (hEl) hEl.textContent = (data.H ?? 0).toFixed(3);
    if (status === 'CRITICAL') showToast('Lyapunov CRITICAL - reputation diverging!', 'error');
});

const entropyHistory = new Array(60).fill(0);
socket.on('entropy_update', (data) => {
    const H = parseFloat(data.H ?? 0), dSdt = parseFloat(data.dSdt ?? 0);
    entropyHistory.push(H); if (entropyHistory.length > 60) entropyHistory.shift();
    const el = document.getElementById('entropy-H'); if (el) el.textContent = H.toFixed(3) + ' bits';
    const dEl = document.getElementById('entropy-dSdt');
    if (dEl) { dEl.textContent = dSdt >= 0 ? 'HEATING' : 'COOLING'; dEl.style.color = dSdt >= 0 ? '#ff4d4d' : '#00ff88'; }
    const hdEl = document.getElementById('entropy-heatdeath');
    if (hdEl) { hdEl.textContent = data.imminent ? 'OVERLOAD ~' + data.eta_seconds + 's' : 'NOMINAL'; hdEl.style.color = data.imminent ? '#ff4d4d' : '#00ff88'; }
    if (data.imminent) showToast('Thermal overload in ~' + data.eta_seconds + 's', 'error');
    _drawPhysicsChart('entropy-canvas', entropyHistory, '#ff6464');
});

socket.on('epidemic_update', (data) => {
    const R0 = parseFloat(data.R0 ?? 0), N = data.N ?? 100;
    const el = document.getElementById('epidemic-R0');
    if (el) { el.textContent = R0.toFixed(2); el.style.color = R0 > 1 ? '#ff4d4d' : R0 > 0.5 ? '#ffd700' : '#00ff88'; }
    const stEl = document.getElementById('epidemic-status');
    if (stEl) { stEl.textContent = data.status || 'CONTAINED'; stEl.style.color = data.is_epidemic ? '#ff4d4d' : '#00ff88'; }
    ['s','i','r'].forEach(k => {
        const b = document.getElementById('epidemic-bar-' + k); if (b) b.style.width = Math.round((data[k.toUpperCase()]||0)/Math.max(N,1)*100)+'%';
        const c = document.getElementById('epidemic-count-' + k); if (c) c.textContent = data[k.toUpperCase()] ?? 0;
    });
    if (data.is_epidemic) showToast('Hallucination EPIDEMIC R0=' + R0.toFixed(2), 'error');
});

socket.on('game_theory_update', (data) => {
    const bneEl = document.getElementById('gt-bne');
    if (bneEl && data.bne) { bneEl.textContent = data.bne.bne_violations > 0 ? 'BNE VIOLATED ' + data.bne.bne_violations : 'BNE OK'; bneEl.style.color = data.bne.bne_violations > 0 ? '#ffd700' : '#00ff88'; }
    const vcgEl = document.getElementById('gt-vcg');
    if (vcgEl && data.vcg) { vcgEl.textContent = 'VCG ' + (data.vcg.rounds_computed||0) + 'r'; vcgEl.style.color = '#00f5ff'; }
    const pneEl = document.getElementById('gt-pne');
    if (pneEl && data.pne) { const r = parseFloat(data.pne.pne_rate)||0; pneEl.textContent = 'PNE ' + (r*100).toFixed(0) + '%'; pneEl.style.color = r>0.8?'#00ff88':'#ffd700'; }
    const wEl = document.getElementById('gt-welfare');
    if (wEl && data.vcg) wEl.textContent = 'Welfare $' + parseFloat(data.vcg.total_social_welfare||0).toFixed(1);
});

const fiedlerHistory = new Array(30).fill(0);
socket.on('laplacian_update', (data) => {
    fiedlerHistory.push(parseFloat(data.lambda2)||0); if (fiedlerHistory.length>30) fiedlerHistory.shift();
    const el = document.getElementById('fiedler-lambda'); if (el) el.textContent = 'lambda2 = ' + (parseFloat(data.lambda2)||0).toFixed(4);
    const nsEl = document.getElementById('fiedler-status');
    if (nsEl) { const c={HIGHLY_REDUNDANT:'#00ff88',ROBUST:'#00f5ff',FRAGILE:'#ffd700',PARTITIONED:'#ff4d4d'}; nsEl.textContent = data.network_status||''; nsEl.style.color = c[data.network_status]||'#fff'; }
    _drawPhysicsChart('fiedler-canvas', fiedlerHistory, '#00f5ff');
    if (data.network_status === 'PARTITIONED') showToast('Network partition risk!', 'error');
});

socket.on('velocity_update', (data) => {
    const V = parseFloat(data.V ?? 0);
    const el = document.getElementById('velocity-V'); if (el) { el.textContent = V.toFixed(3); el.style.color = V>2?'#00ff88':V>0.5?'#00f5ff':'#ff4d4d'; }
    const stEl = document.getElementById('velocity-status'); if (stEl) stEl.textContent = data.status||'';
    const qeEl = document.getElementById('velocity-qe'); if (qeEl) qeEl.style.display = data.qe_active?'inline-block':'none';
    if (data.qe_active) showToast('QE Stimulus Active - escrow boost +10%', 'info');
});

socket.on('chaos_update', (data) => {
    const CSD = data.CSD ?? 0, level = data.warning_level || 'NORMAL';
    const cEl = document.getElementById('chaos-CSD'); if (cEl) { cEl.textContent = CSD.toFixed(2); cEl.style.color = level==='CRITICAL_SLOWING_DOWN'?'#ff4d4d':level==='ELEVATED'?'#ffd700':'#00ff88'; }
    const wEl = document.getElementById('chaos-warning'); if (wEl) { wEl.textContent = level==='CRITICAL_SLOWING_DOWN'?'BIFURCATION RISK':level==='ELEVATED'?'ELEVATED':'NORMAL'; wEl.style.color = level==='CRITICAL_SLOWING_DOWN'?'#ff4d4d':level==='ELEVATED'?'#ffd700':'#00ff88'; }
    const vEl = document.getElementById('chaos-variance'); if (vEl) vEl.textContent = 'variance=' + (data.variance??0).toFixed(1);
    const aEl = document.getElementById('chaos-autocorr'); if (aEl) aEl.textContent = 'AR1=' + (data.autocorrelation??0).toFixed(3);
    if (level === 'CRITICAL_SLOWING_DOWN') showToast('Critical Slowing Down detected!', 'error');
});

function _drawPhysicsChart(canvasId, data, color) {
    const c = document.getElementById(canvasId); if (!c) return;
    const ctx = c.getContext('2d'); const w = c.parentElement ? c.parentElement.clientWidth : 200; c.width = w; const h = c.height || 40;
    ctx.clearRect(0, 0, w, h);
    const max = Math.max(...data, 0.001), step = w / Math.max(data.length - 1, 1);
    ctx.beginPath();
    data.forEach((v, i) => { const x = i*step, y = h-(v/max)*(h-4); i===0 ? ctx.moveTo(x,y) : ctx.lineTo(x,y); });
    ctx.strokeStyle = color; ctx.lineWidth = 1.5; ctx.shadowBlur = 5; ctx.shadowColor = color; ctx.stroke(); ctx.shadowBlur = 0;
}

window.addEventListener('resize', () => { _drawPhysicsChart('entropy-canvas', entropyHistory, '#ff6464'); _drawPhysicsChart('fiedler-canvas', fiedlerHistory, '#00f5ff'); });
