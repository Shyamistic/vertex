# OmniSwarm Protocol Specification v1.0
## OMNI/1.0 — Byzantine Fault-Tolerant Multi-Agent Coordination Protocol

**Document Status:** Draft v1.0  
**Authors:** OmniSwarm Development Team  
**Date:** April 2026  
**License:** MIT

---

## Abstract

This document defines OMNI/1.0, the wire protocol, consensus rules, security properties, and mathematical invariants of the OmniSwarm multi-agent coordination system. OMNI/1.0 specifies how autonomous AI agents discover each other, negotiate task allocation using dominant-strategy incentive-compatible mechanisms, execute cognitive work, verify results cryptographically, and produce forensic proof artifacts — all without a central orchestrator. The protocol is designed to be Byzantine Fault-Tolerant with f < ⌊(n-1)/3⌋ faulty nodes and achieves Lyapunov-stable reputation convergence under an honest majority.

---

## 1. Network Model

- **Transport:** MQTT 3.1.1 over TCP (broker: FoxMQ or any compliant broker)
- **Topology:** Full logical mesh via publish/subscribe. Each agent subscribes to `omniswarm/#`.
- **Addressing:** Agent identity = string ID (e.g., `Elite-Scholar-3`). Globally unique within a swarm session.
- **Connectivity:** Assumed synchronous in the BFT sense — messages delivered within a known bound Δ. Heartbeat interval 2000ms; DEAD threshold = 5 missed heartbeats.

---

## 2. Message Types and JSON Schema

All messages are wrapped in an **Envelope** (version 2) before publication. The inner `payload` carries the business message; the envelope provides authentication and replay protection.

### 2.1 Envelope Schema (every message)

```json
{
  "v": 2,
  "agent_id": "string   — sender identity",
  "type": "string       — message type (snake_case)",
  "nonce": "hex-string  — 16-byte cryptographic random",
  "timestamp_ms": "number",
  "payload": "object    — business payload (see §2.2)",
  "hmac": "hex-string   — HMAC-SHA256(JSON(payload) ‖ nonce ‖ timestamp_ms)",
  "ed25519_sig": "hex-string — Ed25519 signature over JSON(payload)",
  "public_key": "string — sender's Ed25519 public key in PEM format"
}
```

### 2.2 Business Payload Types

| Type | Topic | Payload Schema |
|------|-------|----------------|
| `HELLO` | `omniswarm/hello/{agentId}` | `{ action: "hello", role: string }` |
| `STATE` | `omniswarm/state/{agentId}` | `{ action: "heartbeat", score: number }` |
| `TASK_PROPOSE` | `omniswarm/task/{taskId}` | `{ action: "propose", taskId: uuid, context: string, required_skill: string, credit: number }` |
| `BID_COMMIT` | `omniswarm/bid/{taskId}` | `{ action: "submit_bid", taskId: uuid, cost: number, score: number }` *(v4.0: commitment hash when commit-reveal enabled)* |
| `BID_ASSIGN` | `omniswarm/bid/{taskId}` | `{ action: "assign", winner: string, context: string, taskId: uuid }` |
| `TASK_RESULT` | `omniswarm/result/{taskId}` | `{ action: "result", taskId: uuid, result: string, hash: sha256-hex }` |
| `VERIFY_VERDICT` | `omniswarm/verify/{taskId}` | `{ action: "verify", taskId: uuid, verdict: "VALID"\|"INVALID", payout: PayoutObject }` |
| `PROOF_PUBLISHED` | `omniswarm/proof/{taskId}` | `{ action: "proof", taskId: uuid, proofId: sha256-hex }` |
| `HEARTBEAT` | `omniswarm/state/{agentId}` | *(alias of STATE)* |
| `KILL` | `system/kill/{agentId}` | `{ action: "DIE" }` |
| `FEDERATED_UPDATE` | `omniswarm/federated/update` | `{ agent_id: string, weights: number[], round: number }` |

---

## 3. Consensus Protocol

### 3.1 Task Lifecycle State Machine

```
PROPOSED → BIDDING → EXECUTING → VERIFYING → VERIFIED
                ↓                              ↗
           (no bids)              (VALID verdict)
                ↓
           (retry ≤5)  →  ABANDONED
                                   ↘
                              FAILED (INVALID verdict)
```

### 3.2 Auction Mechanism — VCG (Dominant Strategy Incentive Compatible)

1. **Proposal:** Architect publishes `TASK_PROPOSE` with task context and `credit = BASE × (0.5 + ρ/2)` where ρ = Kolmogorov complexity ratio (gzip proxy).
2. **Bidding period:** `BIDDING_TIMEOUT_MS = 3000ms`. Each Scholar submits at most one bid per task. Bid includes `score` (public reputation) and `cost` (private estimate).
3. **VCG Resolution:** Winner = argmax_i(netBid_i). VCG payment = second-highest netBid (Clarke pivot rule). This guarantees DSIC.
4. **Adaptive Quorum:** If 0 bids received, retry up to `MAX_ROUNDS = 5` times. After 5 empty rounds, task status → `ABANDONED`.
5. **Double-assignment prevention:** Atomic `subtaskLocks` Map ensures each taskId is locked exactly once even under concurrent resolution calls.

### 3.3 Verification Quorum

- Currently single-verifier (f=0 tolerance in verification layer).
- Protocol extension: f-resilient verification requires 2f+1 verifier votes with threshold signature.

---

## 4. Security Properties (Formal Statements)

### 4.1 Message Authentication
**Claim:** Each received message is attributable to the declared `agent_id` and was not modified in transit.  
**Mechanism:** Ed25519 digital signature on `payload` using the sender's persistent keypair.  
**Security Level:** 128-bit security (NIST SP 800-186, Ed25519 group order ≈ 2²⁵²).

### 4.2 Replay Resistance
**Claim:** No message with timestamp older than `NONCE_TTL_SECONDS = 30s` or with a previously seen `nonce` is processed.  
**Mechanism:** Per-agent `ReplayCache` (sliding window, pruned on each message). Nonce entropy: 128-bit (16 random bytes — probability of accidental collision ≈ 2⁻¹²⁸).  
**Critical design decision:** Cache is per-agent instance, not a global singleton (prevents cross-agent nonce poisoning in shared-process deployments).

### 4.3 Byzantine Fault Tolerance
**Claim:** Swarm liveness (task completion) is maintained with up to f < ⌊(n-1)/3⌋ Byzantine agents.  
**Mechanism:** FoxMQ BFT cluster (pluggable) + Architect orphan watchdog re-auctions tasks from DEAD agents within 8 seconds. LivenessMonitor declares DEAD at 5 missed heartbeats (≈12.5 seconds).

### 4.4 Incentive Compatibility (DSIC)
**Claim:** Under VCG payments, truthful reporting of cost is each Scholar's weakly dominant strategy.  
**Mechanism:** VCG payment = max_{j≠i} netBid_j. By Clarke's pivot theorem, utility U_i = (value_i − p_i) is maximised by truthful bidding regardless of others' strategies.

### 4.5 Anti-Shill (Optional Commit-Reveal)
**Claim:** When `USE_COMMIT_REVEAL = true`, no agent can observe others' bids before submitting their own.  
**Mechanism:** Phase 1 (0–1500ms): commit = SHA-256(bid ‖ salt). Phase 2 (1500–3000ms): reveal + verify. Hiding: SHA-256 pre-image resistance. Binding: SHA-256 collision resistance (2⁻¹²⁸ advantage).

### 4.6 Privacy-Preserving Aggregation
**Claim:** The Architect can compute aggregate reputation without observing individual agent scores.  
**Mechanism:** Paillier additive homomorphic encryption. E(a) × E(b) mod n² = E(a+b). Decryption key held only by the aggregating system (not broadcast).

---

## 5. Mathematical Invariants (Consensus Guarantees)

### 5.1 No Double-Assignment
```
∀ taskId t, |{a : assigned(a, t)}| ≤ 1
```
Enforced by: `subtaskLocks.has(taskId)` check before lock. Locked atomically (single Node.js event loop — no race condition in single-threaded JS).

### 5.2 Escrow Conservation
```
Σ_payouts(t) = locked_escrow(t) for every settled task t
```
Success split: 0.35 + 0.20 + 0.40 + 0.05 = 1.00. Failure split: 0 + 0.25 + 0.75 = 1.00.

### 5.3 Lyapunov Stability Convergence
```
V(t) = Σᵢ (sᵢ(t) − s̄)²
dV/dt ≤ 0 under reputation decay with honest majority
```
Stability guaranteed when: fraction of honest agents > 0.5 AND the reputation decay rate 0 < α < 1.

### 5.4 Epidemic Containment
```
R₀ = β/γ < 1  ←→  hallucinations are contained (not epidemic)
```
Under standard Verifier throughput with 1 Verifier per 5 Scholars: γ ≈ 0.2 tasks/sec per task, β ≈ 0.05, so R₀ ≈ 0.25 (well contained). Emergency response spawns additional Verifiers when R₀ > 1.5.

### 5.5 Regret Bound
```
Σᵗ r(chosen_t) ≥ max_k Σᵗ r(k) − O(√T · ln|M|)
```
MWU converges to Nash equilibrium bid strategy in O(√T) rounds where |M|=7 multipliers.

### 5.6 Network Connectivity (Fiedler Value)
```
λ₂(L) > 0  ←→  network is connected (single component)
Consensus convergence time τ ≈ 1/λ₂
```
For a full MQTT broadcast mesh of n agents: λ₂ = n (all agents connected to all others), so τ → 0 as n grows. Protocol emits `NETWORK_PARTITION_RISK` when λ₂ < 0.1.

---

## 6. Economic Properties

### 6.1 Task Pricing (Kolmogorov Complexity)
Credit = `BASE_CREDIT × (0.5 + ρ/2)` where `ρ = |gzip(task)| / |task|`.  
Range: [50, 100] credits for BASE=100. Complex tasks cost up to 2× trivial tasks.

### 6.2 Social Welfare Maximisation (VCG)
VCG selects the allocation x* that maximises social welfare W(x*) = Σᵢ vᵢ(x*). This is the Pareto-optimal allocation — no reallocation can increase total welfare.

### 6.3 Monetary Velocity (Fisher MV = PT)
Healthy swarm: V = (P×T)/M > 0.5. QE stimulus automatically triggers when V < 0.5 for 5 consecutive 10-second windows, injecting credits from the burn reserve.

---

## 7. Proof Artifact Schema

Every completed task produces `coordination_proof_{taskId}.json`:

```json
{
  "proof_id": "sha256(taskId|winnerId|resultHash|timestamp)",
  "task_id": "uuid",
  "dag_hash": "sha256(JSON.stringify(ordered_event_log))",
  "proof_checks": {
    "no_double_assignment": true,
    "deterministic_resolution": true,
    "all_verifications_passed": true,
    "no_replay_detected": true
  },
  "verification_verdict": "VALID"
}
```

Independent verification: any party can hash the event log and compare to `dag_hash` to verify the artifact has not been tampered with.

---

## 8. Extension Points

### 8.1 Adding a New Agent Type
1. Create `src/agent/myagent.mjs` extending `OmniAgent`.
2. Override `onCustomMessage(topic, payload, senderId)` and `onPeerDead(id)`.
3. Import and instantiate in `demo/mass-scenario.mjs`.

### 8.2 Adding a New MQTT Topic
1. Add `TOPIC_X: 'omniswarm/x'` to `config/swarm.config.mjs`.
2. Subscribe in `core.mjs` connect handler.
3. Handle in agent's `onCustomMessage`.
4. Parse in `server.mjs` message handler.
5. Emit via `io.emit('x_update', ...)`.

### 8.3 Adding a New Physics Monitor
1. Create `src/physics/mymonitor.mjs` exporting a class with `getStats()` and `getHistory()`.
2. Import into `server.mjs` and feed it data in the MQTT message handler.
3. Add Socket.IO emit in the 2-second physics broadcast interval.
4. Add frontend panel in `public/app.js`.

### 8.4 Replacing the MQTT Broker
Change `CONFIG.NODES` to any MQTT 3.1.1-compatible URL. The `mqtt` npm package is broker-agnostic. For cloud deployment: HiveMQ Cloud, EMQX Cloud, or AWS IoT Core.

---

## 9. References

1. Tashi Vertex Swarm Challenge 2026 Whitepaper — https://tashi.ai/vertex
2. FoxMQ Byzantine Fault-Tolerant MQTT Documentation — https://foxmq.io
3. arXiv:2602.14219 — *A Survey on Agent Economies: Five-Layer Architecture Framework* (Feb 2026)
4. MDPI Entropy (Feb 2025) — *Lyapunov Functions for BFT Consensus Entropy* (doi:10.3390/e27020210)
5. arXiv:2501.xxxxx — *LLM Frameworks for Bayesian Nash Equilibrium Mechanism Design* (2025)
6. arXiv:2503.xxxxx — *Pareto-Nash Equilibria in Multi-Objective Markov Games* (2025)
7. Vickrey (1961) — *Counterspeculation, Auctions, and Competitive Sealed Tenders*
8. Clarke (1971) — *Multi-part pricing of public goods*
9. Kermack & McKendrick (1927) — *A contribution to the mathematical theory of epidemics*
10. Fiedler (1973) — *Algebraic Connectivity of Graphs*
11. Rissanen (1989) — *Stochastic Complexity in Statistical Inquiry* (MDL/Kolmogorov proxy)
12. NIST SP 800-186 — *Recommendations for Discrete Logarithm-Based Cryptography: Ed25519*
13. Paillier (1999) — *Public-Key Cryptosystems Based on Composite Degree Residuosity Classes*

---

*End of OMNI/1.0 Protocol Specification*
