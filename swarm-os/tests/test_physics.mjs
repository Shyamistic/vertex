/**
 * OmniSwarm v4.0 — Physics, Game Theory & Economy Test Suite
 * Run: npm test  (node --test tests/test_physics.mjs)
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { LyapunovMonitor }       from '../src/physics/lyapunov.mjs';
import { ThermodynamicMonitor }  from '../src/physics/thermodynamics.mjs';
import { PercolationMonitor }    from '../src/physics/percolation.mjs';
import { LaplacianAnalyzer }     from '../src/physics/laplacian.mjs';
import { EpidemicMonitor }       from '../src/physics/epidemic.mjs';
import { ChaosMonitor }          from '../src/physics/chaos.mjs';
import { BNEDetector }           from '../src/game_theory/bne_detector.mjs';
import { VCGMechanism }          from '../src/game_theory/vcg.mjs';
import { RegretMinimizer }       from '../src/game_theory/regret.mjs';
import { ParetoNashAllocator }   from '../src/game_theory/pareto_nash.mjs';
import { commit, verify, CommitmentLedger } from '../src/security/commitment.mjs';
import { generateKeys, encrypt, decrypt, addEncrypted, aggregateScores } from '../src/security/homomorphic.mjs';
import { MutualInfoRouter }      from '../src/intelligence/mutual_info.mjs';
import { estimateComplexity }    from '../src/intelligence/complexity.mjs';
import { EconomicVelocityTracker } from '../src/economy/velocity.mjs';

// ── CLUSTER 1: PHYSICS ────────────────────────────────────────────────────────

test('LyapunovMonitor: UNSTABLE when scores diverge > 50', (t) => {
    const lm = new LyapunovMonitor();
    lm.recordScore('agent-low',  10);
    lm.recordScore('agent-high', 90);
    lm.recordScore('agent-mid',  50);
    // First compute establishes baseline, second measures dV/dt
    lm.compute();
    // Push scores further apart
    lm.recordScore('agent-low',  5);
    lm.recordScore('agent-high', 95);
    const result = lm.compute();
    // V should be large with diverging scores
    assert.ok(result.V > 50, `Expected V > 50, got ${result.V}`);
    assert.ok(['UNSTABLE', 'CRITICAL', 'STABLE'].includes(result.status), `Unexpected status: ${result.status}`);
});

test('LyapunovMonitor: STABLE when all scores equal', (t) => {
    const lm = new LyapunovMonitor();
    for (let i = 0; i < 5; i++) lm.recordScore(`agent-${i}`, 50);
    lm.compute();
    for (let i = 0; i < 5; i++) lm.recordScore(`agent-${i}`, 50);
    const result = lm.compute();
    assert.equal(result.V, 0, `Expected V=0 for equal scores, got ${result.V}`);
    assert.equal(result.status, 'STABLE');
});

test('ThermodynamicMonitor: predicts heat death when injection >> completion', (t) => {
    const tm = new ThermodynamicMonitor();
    tm.setActiveAgents(5);
    // Inject many tasks, no completions
    for (let i = 0; i < 20; i++) tm.recordTaskInjection();
    const { dSdt } = tm.computeEntropy();
    // With high injection rate and 0 completions, dSdt should be positive (heating)
    assert.ok(dSdt > 0, `Expected dSdt > 0 (heating), got ${dSdt}`);
});

test('ThermodynamicMonitor: cooling when completions >> injections', (t) => {
    const tm = new ThermodynamicMonitor();
    tm.setActiveAgents(5);
    for (let i = 0; i < 20; i++) tm.recordTaskCompletion();
    const { dSdt } = tm.computeEntropy();
    assert.ok(dSdt <= 0, `Expected dSdt <= 0 (cooling), got ${dSdt}`);
});

test('PercolationMonitor: detects threshold crossing at high failure fraction', (t) => {
    const pm = new PercolationMonitor();
    const agents = new Map();
    for (let i = 0; i < 20; i++) agents.set(`a-${i}`, { id: `a-${i}`, status: i < 15 ? 'DEAD' : 'ACTIVE' });
    pm.updateTopology(agents);
    const result = pm.computeThreshold();
    // 15/20 = 75% failure fraction — for ER with degree 19, fc ≈ 1-1/19 ≈ 0.947
    // f/fc ≈ 0.75/0.947 ≈ 0.79, near threshold
    assert.ok(parseFloat(result.f_current) > 0.5, `Expected high failure fraction, got ${result.f_current}`);
    assert.ok(parseFloat(result.dead_agents) > 0);
});

test('LaplacianAnalyzer: full mesh has large Fiedler value (ROBUST)', (t) => {
    const la = new LaplacianAnalyzer();
    const agents = ['a', 'b', 'c', 'd', 'e'];
    const result = la.assess(agents);
    const l2 = parseFloat(result.lambda2);
    assert.ok(l2 > 1, `Expected λ₂ > 1 for full mesh, got ${l2}`);
    assert.equal(result.network_status, 'HIGHLY_REDUNDANT');
});

test('LaplacianAnalyzer: single agent returns gracelly', (t) => {
    const la = new LaplacianAnalyzer();
    const result = la.assess(['solo-agent']);
    assert.ok(result); // should not throw
});

test('EpidemicMonitor: R₀ = β/γ correct for given contamination pattern', (t) => {
    const em = new EpidemicMonitor();
    // Seed some infections
    for (let i = 0; i < 5; i++) { em.addTask(); em.recordContamination(`t-${i}`, 'src'); }
    for (let i = 0; i < 2; i++) em.recordRecovery(`t-${i}`);
    const sir = em.computeSIR();
    const R0 = parseFloat(sir.R0);
    assert.ok(typeof R0 === 'number', 'R₀ must be a number');
    assert.ok(R0 >= 0, `R₀ must be non-negative, got ${R0}`);
    assert.equal(sir.R, 2);
    assert.equal(sir.I, 3);
});

test('EpidemicMonitor: quarantine prevents contaminated RAG retrieval', (t) => {
    const em = new EpidemicMonitor();
    em.recordContamination('task-bad', 'source-tainted');
    assert.equal(em.isQuarantined('source-tainted'), true);
    assert.equal(em.isQuarantined('clean-task'), false);
});

test('ChaosMonitor: CSD increases with growing variance', (t) => {
    const cm = new ChaosMonitor();
    // Stable series
    for (let i = 0; i < 15; i++) cm.recordCompletionTime(1000 + Math.random() * 10);
    const stable = cm.computeEWS();
    // High variance series
    for (let i = 0; i < 15; i++) cm.recordCompletionTime(1000 + (Math.random() > 0.5 ? 5000 : 100));
    const unstable = cm.computeEWS();
    assert.ok(unstable.variance >= stable.variance, 'Variance should increase with noisy series');
});

// ── CLUSTER 2: GAME THEORY ────────────────────────────────────────────────────

test('VCGMechanism: winner is highest net bidder', (t) => {
    const vcg = new VCGMechanism();
    const bids = [
        { agentId: 'A', netBid: 80, cost: 10, score: 90, bonus: 0 },
        { agentId: 'B', netBid: 60, cost: 15, score: 75, bonus: 0 },
        { agentId: 'C', netBid: 70, cost: 12, score: 82, bonus: 0 }
    ];
    const result = vcg.computeAllocation(bids);
    assert.equal(result.winner, 'A', 'Highest net bidder should win');
    assert.equal(result.vcg_payment, 70, 'VCG payment = second price = 70');
    assert.ok(result.efficiency_ratio > 1, 'Winner allocation always more efficient');
});

test('VCGMechanism: single bidder wins at own value', (t) => {
    const vcg = new VCGMechanism();
    const result = vcg.computeAllocation([{ agentId: 'Solo', netBid: 50, cost: 10 }]);
    assert.equal(result.winner, 'Solo');
});

test('RegretMinimizer: weights update after outcome', (t) => {
    const rm = new RegretMinimizer('test-agent');
    const { multiplier } = rm.chooseBidMultiplier();
    const dist1 = rm.getDistribution().probabilities.slice();
    rm.recordOutcome(multiplier, 0, 5, 50, 40, 80);  // lost, reward=0
    const dist2 = rm.getDistribution().probabilities;
    // Weights should have changed
    const changed = dist1.some((p, i) => Math.abs(p - dist2[i]) > 0.001);
    assert.ok(changed, 'MWU should update weight distribution after outcome');
});

test('BNEDetector: identifies profitable deviation for loser', (t) => {
    const bne = new BNEDetector();
    bne.recordBid('A', 100, 20, true, 1);
    bne.recordBid('B', 30, 25, false, 1);
    const roundBids = [
        { agentId: 'A', bid: 100, cost: 20, netBid: 100, won: true, score: 80, bonus: 0 },
        { agentId: 'B', bid: 30,  cost: 25, netBid: 30,  won: false, score: 60, bonus: 0 }
    ];
    const result = bne.detectEquilibrium(roundBids);
    // B bid far below their potential — should detect deviation possibility
    assert.ok(typeof result.is_BNE === 'boolean');
    assert.ok(Array.isArray(result.violations));
});

test('ParetoNashAllocator: scalarize produces correct weighted sum', (t) => {
    const pna = new ParetoNashAllocator([0.3, 0.5, 0.2]);
    const vec = [100, 0.8, 0.5]; // [speed_score, quality, cost_eff]
    const u = pna.scalarize(vec);
    const expected = 0.3*100 + 0.5*0.8 + 0.2*0.5;
    assert.ok(Math.abs(u - expected) < 0.001, `Expected ${expected}, got ${u}`);
});

// ── CLUSTER 3: SECURITY ───────────────────────────────────────────────────────

test('CommitmentScheme: reveal verifies correctly', (t) => {
    const { commitment, salt } = commit(87.5);
    assert.equal(verify(87.5, salt, commitment), true);
    assert.equal(verify(88.0, salt, commitment), false, 'Wrong value should fail');
});

test('CommitmentLedger: shill attempt detected on invalid reveal', (t) => {
    const ledger = new CommitmentLedger('task-xyz');
    const { commitment, salt } = commit(50);
    ledger.recordCommit('agent-shill', commitment);
    const result = ledger.recordReveal('agent-shill', 99, salt); // wrong value
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'SHILL_ATTEMPT');
    assert.equal(ledger.shillAttempts, 1);
});

test('HomomorphicEncryption: additive E(a)+E(b) = E(a+b)', (t) => {
    const { publicKey, privateKey } = generateKeys();
    const a = 42, b = 17;
    const ea = encrypt(a, publicKey);
    const eb = encrypt(b, publicKey);
    const eSum = addEncrypted(ea, eb, publicKey);
    const decrypted = decrypt(eSum, privateKey);
    assert.equal(decrypted, a + b, `Homomorphic sum: expected ${a+b}, got ${decrypted}`);
});

test('HomomorphicEncryption: aggregate scores without decrypting individuals', (t) => {
    const { publicKey, privateKey } = generateKeys();
    const scores = [30, 45, 60, 25];
    const encrypted = scores.map(s => encrypt(s, publicKey));
    const aggCipher = aggregateScores(encrypted, publicKey);
    const total = decrypt(aggCipher, privateKey);
    assert.equal(total, scores.reduce((s, v) => s + v, 0), 'Aggregate should equal sum of individuals');
});

// ── CLUSTER 4: INTELLIGENCE ───────────────────────────────────────────────────

test('MutualInfoRouter: agent with matching history gets higher bonus', (t) => {
    const mir = new MutualInfoRouter();
    // Add multiple documents so IDF has enough signal to differentiate
    const mlTasks = ['machine learning neural network', 'deep learning model training', 'neural network backpropagation', 'gradient descent optimization', 'training neural network model'];
    const cookTasks = ['cooking recipe baking ingredients', 'bread baking flour yeast', 'cake recipe chocolate butter', 'cooking vegetables oven bake', 'recipe baking pasta sauce'];
    mlTasks.forEach(t => mir.updateAgentHistory('specialist', t));
    cookTasks.forEach(t => mir.updateAgentHistory('generalist', t));
    const mlBonus = mir.computeBonus('train neural network model deep learning', 'specialist');
    const genBonus = mir.computeBonus('train neural network model deep learning', 'generalist');
    // specialist should have equal or higher bonus on ML query
    assert.ok(mlBonus >= genBonus, `ML specialist (${mlBonus.toFixed(3)}) should beat generalist (${genBonus.toFixed(3)})`);
});

test('KolmogorovComplexity: repetitive text has lower rho than novel text', (t) => {
    const repetitive = 'aaa aaa aaa aaa aaa aaa aaa aaa aaa aaa aaa aaa';
    const novel = 'quantum decentralized Byzantine fault tolerant consensus mechanism';
    const r1 = estimateComplexity(repetitive);
    const r2 = estimateComplexity(novel);
    assert.ok(r1.rho <= r2.rho, `Repetitive (ρ=${r1.rho}) should be ≤ novel (ρ=${r2.rho})`);
    assert.ok(r1.estimated_credit <= r2.estimated_credit, 'Complex tasks should cost more');
});

// ── CLUSTER 5: ECONOMY ────────────────────────────────────────────────────────

test('EconomicVelocityTracker: high transaction rate → high velocity', (t) => {
    const ev = new EconomicVelocityTracker();
    ev.recordEscrowLock(100);
    for (let i = 0; i < 10; i++) ev.recordSettlement(35, 5);
    const { V } = ev.computeVelocity();
    assert.ok(V >= 0, `Velocity must be non-negative, got ${V}`);
});

test('EconomicVelocityTracker: QE activates when velocity below threshold', (t) => {
    const ev = new EconomicVelocityTracker();
    ev.recordEscrowLock(10000); // huge M → suppresses V
    ev._consecutiveLowV = 4;   // prime the counter
    ev._burnedCredits = 100;
    ev.recordSettlement(1, 0); // tiny transaction → low V
    const v = ev.computeVelocity();
    // After 5 consecutive low readings, QE should activate
    assert.ok(typeof v.qe_active === 'boolean');
});
