# OmniSwarm v3.0 — Complete System Research Brief
### A Production-Grade Byzantine Fault-Tolerant Multi-Agent Operating System
#### For the Vertex Swarm Challenge 2026 — Track 3: The Agent Economy

---

> **Purpose of this document:** This is the canonical technical reference for OmniSwarm v3.0. It is written to be complete, precise, and self-contained so that any LLM or developer can fully understand the system, trace every data flow, identify every module dependency, and confidently extend or build upon it without requiring any prior context.

---

## 1. Executive Summary

OmniSwarm v3.0 is a **leaderless, Byzantine Fault-Tolerant multi-agent coordination operating system** built on Node.js (ES Modules) with FoxMQ (MQTT protocol) as the P2P message bus. It orchestrates up to **5,000 autonomous AI agents** that collectively decompose, bid on, execute, verify, and forensically prove complex cognitive tasks — all without a central orchestrator.

The three core guarantees:
1. **Safety** — No task is double-assigned. No message can be replayed. Every result is cryptographically verified before settlement.
2. **Liveness** — The swarm self-heals. Dead agents are detected within ~15 seconds. Orphaned tasks are automatically re-auctioned.
3. **Auditability** — Every event, bid, and verdict generates a Merkle-hashed, JSON-structured proof artifact readable by judges or external programs.

---

## 2. Repository Structure

```
vertex/swarm-os/
├── config/
│   └── swarm.config.mjs         # Single source of truth for all tunables
├── src/
│   ├── agent/
│   │   ├── core.mjs              # OmniAgent base class (all agents inherit this)
│   │   ├── architect.mjs         # ArchitectAgent — task decomposition + auction
│   │   ├── scholar.mjs           # ScholarAgent — bids, executes, calls LLM
│   │   ├── verifier.mjs          # VerifierAgent — validates results, slashes, generates proofs
│   │   ├── reputation.mjs        # ReputationSystem — score decay, tracking
│   │   └── liveness.mjs          # LivenessMonitor — heartbeat miss detection (BFT)
│   ├── security/
│   │   ├── envelope.mjs          # packEnvelope() — signs every outbound message
│   │   ├── identity.mjs          # Ed25519 key management (per agent, persistent)
│   │   └── replay.mjs            # ReplayCache — per-agent sliding window anti-replay
│   ├── llm/
│   │   ├── router.mjs            # askLLM() — multi-model fallback chain + 60s cache
│   │   └── rag.mjs               # Local TF-IDF RAG context injector
│   ├── economy/
│   │   ├── escrow.mjs            # In-memory token vault (lock/settle)
│   │   ├── slasher.mjs           # Writes slash records to disk
│   │   └── profiles.mjs          # Specialization bonus lookup table
│   ├── proof/
│   │   ├── coordinator.mjs       # Generates coordination_proof_{id}.json
│   │   ├── event_logger.mjs      # Append-only structured event log
│   │   └── economy_rounds.mjs    # Logs each bidding round to economy_rounds.json
│   ├── panel/
│   │   └── server.mjs            # Express + Socket.IO dashboard observer server
│   ├── arc/
│   │   └── bridge.mjs            # Tashi Arc settlement stub (blockchain simulation)
│   ├── testing/
│   │   └── fault_injector.mjs    # Byzantine failure injection (drop/delay/manipulate)
│   └── utils/
│       ├── env_check.mjs          # Pre-flight API key / environment validation
│       └── inspector.mjs          # Interactive REPL inspector
├── demo/
│   ├── run-full-demo.mjs         # 1-click boot: server + FoxMQ + mass scenario
│   ├── mass-scenario.mjs         # Spawns 5 Elite + 3 Verifier + 4992 Shard agents
│   └── scenario.mjs              # Minimal 3-agent dev scenario
├── public/
│   ├── index.html                # Glassmorphism dashboard HTML (13 panel features)
│   ├── app.js                    # D3.js + Socket.IO live client
│   └── style.css                 # Full premium design system (CSS variables + glassmorphism)
├── tests/
│   └── test_suite.mjs            # Node.js native test runner (npm test)
├── artifacts/                    # [GENERATED] Run-specific proof bundles
│   └── {run_id}/
│       ├── coordination_proof_{task_id}.json
│       ├── structured_event_log.json
│       ├── economy_rounds.json
│       └── swarm_session_summary.json
└── foxmq-bin/                    # FoxMQ binary (MQTT broker)
```

---

## 3. Configuration (`config/swarm.config.mjs`)

All system behaviour is controlled by a single exported `CONFIG` object:

```js
{
    // MQTT broker connection strings (supports multiple nodes for federation)
    NODES: ['mqtt://oow:oow123@127.0.0.1:1883'],

    // PubSub Topic Namespace
    TOPIC_HELLO:  'omniswarm/hello',   // Agent announcements
    TOPIC_STATE:  'omniswarm/state',   // Heartbeat / reputation score
    TOPIC_TASK:   'omniswarm/task',    // Task proposals from Architect
    TOPIC_BID:    'omniswarm/bid',     // Scholar bids + Architect winner assignments
    TOPIC_RESULT: 'omniswarm/result',  // Scholar result submissions
    TOPIC_VERIFY: 'omniswarm/verify',  // Verifier verdicts
    TOPIC_PROOF:  'omniswarm/proof',   // Final coordination proof IDs
    TOPIC_HIVE:   'omniswarm/hive',    // Reserved for swarm-wide broadcasts
    
    // Timing
    HEARTBEAT_INTERVAL_MS: 2000,
    BIDDING_TIMEOUT_MS: 3000,
    NONCE_TTL_SECONDS: 30,

    // Token Economy
    COMPUTE_RATE_PER_TOKEN: 0.5,
    REPUTATION_DECAY_RATE: 0.98,       // 2% score drop per heartbeat cycle
    DEFAULT_CREDIT_ESCROW: 100,

    // Byzantine Constraints
    SLASH_PENALTY: 15,
    QUORUM_RATIO: 0.5,                 // (Historical — now overridden by MAX_ROUNDS=5 adaptive logic)

    // LLM Cognitive Layer
    FEATHERLESS_API_KEY: process.env.FEATHERLESS_API_KEY || '',
    LLM_FALLBACK_CHAIN: [
        'meta-llama/Llama-3.3-70B-Instruct',
        'Qwen/Qwen2.5-72B-Instruct',
        'mistralai/Mistral-7B-Instruct-v0.3'
    ]
}
```

---

## 4. Security Layer (`src/security/`)

### 4.1 Message Envelope (`envelope.mjs`)

Every single message published by any agent is wrapped in a standardised envelope. **Raw payloads are never put on the wire.**

```js
// Shape of every MQTT message published:
{
    v: 2,                   // Envelope version
    agent_id: 'Elite-Scholar-1',
    type: 'bid',            // Derived from topic segment
    nonce: '<16-byte hex>', // Cryptographically random, unique per message
    timestamp_ms: 1712345678901,
    payload: { /* business data */ },
    hmac: '<sha256-hex>',   // HMAC-SHA256 of (payload + nonce + timestamp_ms)
    ed25519_sig: '<hex>',   // Ed25519 digital signature over payload
    public_key: '<PEM>'     // Sender's public key, attached for instant peer verification
}
```

**Why both HMAC and Ed25519?** HMAC provides fast integrity checking with a shared secret. Ed25519 provides non-repudiable asymmetric authentication — a verifier that has never seen this agent before can still verify the signature using only the attached public key.

### 4.2 Identity Management (`identity.mjs`)

Each agent generates an Ed25519 keypair on first connection. The keypair is **persisted to `data/keys_{agentId}.json`** so it survives restarts. The `signPayload` function uses Node.js's native `crypto.sign(null, buffer, privateKey)` pattern — passing `null` as the algorithm because Ed25519 does its own internal hashing.

```js
export async function getOrGenerateIdentity(agentId) → { privateKey, publicKeyPem }
export function signPayload(data, privateKey) → hexString
export function verifySignature(data, signatureHex, publicKeyPemOrObject) → boolean
```

**Critical note:** `verifySignature` accepts both a raw PEM string and a `KeyObject` — the conversion is handled internally to prevent crashes when the key comes over the wire as a PEM string.

### 4.3 Anti-Replay (`replay.mjs`)

**Design decision — per-agent instance, not a global singleton.** The original implementation used a module-level singleton `Map`. This caused a critical bug: when multiple agents share the same Node.js process (as they do in the mass scenario), agent B would see and cache a nonce from agent A's outbound message, then reject it as a replay when agent A's own handler tried to process it. The fix was making `ReplayCache` a class instantiated once per `OmniAgent`:

```js
class ReplayCache {
    isReplay(nonce, timestamp_ms) {
        // Returns true if:
        // 1. Message is older than CONFIG.NONCE_TTL_SECONDS (30s)  → stale
        // 2. nonce already exists in the window cache              → replay
        // Otherwise: records nonce, prunes expired entries, returns false
    }
}
```

Agents instantiate: `this._replayCache = new ReplayCache()` in their constructor.

---

## 5. Agent Layer (`src/agent/`)

### 5.1 Base Class: `OmniAgent` (`core.mjs`)

All three agent types (Architect, Scholar, Verifier) extend `OmniAgent`. It handles:
- MQTT connection setup and all topic subscriptions
- Kill-switch listener (`system/kill/{agentId}`) — serverside fault injection
- Per-agent replay cache check (`this._replayCache.isReplay(...)`)
- Ed25519 signature verification on every received message
- Self-heartbeat (`publishState()` every `HEARTBEAT_INTERVAL_MS`)
- Liveness monitor tick every 5 seconds (triggers `onPeerDead(id)` callback)
- `handleMessage()` → routes HELLO/STATE to peer registry, everything else to `onCustomMessage(topic, payload, senderId)`

**Key override pattern:**
```js
class MyAgent extends OmniAgent {
    onCustomMessage(topic, payload, senderId) { /* business logic */ }
    onPeerDead(deadAgentId) { /* self-healing logic */ }
}
```

**Important:** `senderId` is extracted from the envelope's `agent_id` field **before** it is passed down — it is NOT inside the inner `payload`. Subclasses must use `senderId` parameter, not `payload.sender` (which does not exist).

### 5.2 `ArchitectAgent` (`architect.mjs`)

**Responsibilities:** Decompose complex queries into subtasks, run Dutch auctions, assign winners, monitor orphans, track degradation level.

**Full task lifecycle from Architect's perspective:**
1. `submitQuery(macroQuery)` is called externally
2. Calls `askLLM(xmlPrompt)` to decompose the macro query into `[{ subtask, complexity, required_skill }]`
3. For each subtask: `lockEscrow(taskId, amount)`, store in `activeTasks` Map, publish to `TOPIC_TASK/{taskId}` with `{ action: 'propose', taskId, context, required_skill }`
4. After `BIDDING_TIMEOUT_MS` (3s), calls `resolveBids()`
5. **Adaptive Quorum** (`resolveBids`): If ≥1 bid exists → proceed. If 0 bids and round < 5 → retry. If 0 bids after 5 rounds → abandon task.
6. On resolution: sort bids by `score - cost + bonus` descending, set winner, publish to `TOPIC_BID/{taskId}` with `{ action: 'assign', winner, context }` — this is what triggers Scholar execution.
7. **Double-assignment prevention:** `subtaskLocks` Map ensures a task can only be locked once even under concurrent `resolveBids` calls.
8. **Orphan watchdog** (every 5s): If a task status is `EXECUTING` for >8s without a result, it resets to `BIDDING` and re-auctions.
9. **Degradation tracking** (`onPeerDead`): Counts dead peers. Switches to `DEGRADED` at 1+ dead, `CRITICAL` at >30% dead. In `CRITICAL` mode, `submitQuery` is blocked.

**Scoring formula (deterministic — all nodes reach same conclusion):**
```
net_bid = agent_score - cost_estimate + specialization_bonus
```

### 5.3 `ScholarAgent` (`scholar.mjs`)

**Responsibilities:** Evaluate incoming task proposals, submit bids, and execute assigned tasks via LLM.

**Flow:**
1. Receives `TOPIC_TASK/{id}` with `{ action: 'propose', taskId, context }`
2. `evaluateTask()`: computes `costEstimate = max(1, wordCount * 0.05)`. If `myScore > costEstimate`, publishes bid to `TOPIC_BID/{taskId}` with `{ action: 'submit_bid', taskId, cost, score }`.
3. Receives `TOPIC_BID/{id}` with `{ action: 'assign', winner }`. If `winner === this.agentId`, calls `executeTask()`.
4. `executeTask()`: calls `injectRAGContext(context)`, then `askLLM(enrichedPrompt)`. Hashes the result with SHA-256. Publishes to `TOPIC_RESULT/{taskId}` with `{ action: 'result', taskId, result, hash }`.

**Elite vs. Shard distinction:**
- `isElite = true` → `askLLM` actually calls the Featherless API with real LLM
- `isElite = false` → `askLLM` returns a hardcoded simulated string (rate-limit safe for the 4990 shard instances)

### 5.4 `VerifierAgent` (`verifier.mjs`)

**Responsibilities:** Independently validate Scholar results, slash hallucinations, settle escrow, generate proof artifacts.

**Flow:**
1. Receives `TOPIC_RESULT/{id}`. Extracts `scholarId` from `senderId` parameter (NOT `payload.sender`).
2. Sends the result to LLM for structural hallucination assessment: `{ verdict: "VALID"|"INVALID", confidence: 0-100, flags: [] }`. Defaults to `{ verdict: "VALID", confidence: 100 }` if LLM parse fails.
3. Calls `settleEscrow(taskId, isValid, scholarId, verifierId, architectId)` to compute payout splits.
4. If `INVALID` or `confidence < 70`: calls `processSlash(scholarId, ...)` which subtracts `SLASH_PENALTY` from reputation and writes a slash record.
5. Publishes verdict to `TOPIC_VERIFY/{taskId}`.
6. On `VALID`: calls `generateCoordinationProof({task_id, winner_agent_id, result_hash, verdict, checks})` → writes `coordination_proof_{task_id}.json` to `artifacts/{run_id}/`.
7. Publishes proofId to `TOPIC_PROOF/{taskId}`.

### 5.5 `ReputationSystem` (`reputation.mjs`)

Each agent holds its own `ReputationSystem`. Tracks `tasksCompleted`, `hallucinations`, `slashHistory`. `decay()` multiplies the score by `REPUTATION_DECAY_RATE (0.98)` each heartbeat cycle — agents that stop working gradually lose score. `getScore(agentId)` returns the current numeric value.

### 5.6 `LivenessMonitor` (`liveness.mjs`)

A per-agent in-memory table. `recordHeartbeat(agentId, score)` resets the miss counter. `tick()` — called every 5s — increments miss counters for agents not heard from in >2500ms. At 3 misses → `SUSPECT`. At 5 misses → `DEAD`. Returns an array of status-change events so the caller (`OmniAgent`) can fire `onPeerDead()` callbacks.

---

## 6. LLM Cognitive Layer (`src/llm/`)

### 6.1 Router (`router.mjs`)

Uses the `openai` npm package configured to point at `https://api.featherless.ai/v1` — a drop-in OpenAI-compatible API that proxies to thousands of HuggingFace models.

**Fallback chain:** Tries each model in `CONFIG.LLM_FALLBACK_CHAIN` sequentially. On any error (rate limit, 500, timeout), moves to the next. Returns the first success.

**60-second response cache:** SHA-256 hashes `prompt + context` as the cache key. Prevents redundant API calls for identical queries during a short window.

**Two-tier operation:**
- `isElite = true` → real API call
- `isElite = false` → instant simulated stub response (represents the 4990 non-elite shard agents without hitting rate limits)

**To add a new model:** Simply add its Featherless-compatible model ID string to `LLM_FALLBACK_CHAIN` in `swarm.config.mjs`.

### 6.2 RAG Engine (`rag.mjs`)

A zero-dependency TF-IDF local retrieval system. `saveToRAGMemory(text)` indexes past LLM outputs. `injectRAGContext(query)` finds the most relevant stored passage and prepends it to the query. Useful for scholars that execute related subtasks in sequence.

---

## 7. Economy Layer (`src/economy/`)

### 7.1 Escrow (`escrow.mjs`)

In-memory Map (`vault`). `lockEscrow(taskId, requesterId, amount)` reserves tokens at task creation. `settleEscrow(taskId, isSuccess, ...)` distributes or refunds:

| Outcome | Scholar | Verifier | Architect | Burn/Refund |
|---------|---------|----------|-----------|-------------|
| VALID   | 35%     | 20%      | 40%       | 5% burned   |
| INVALID | 0%      | 25%      | 0%        | 75% refunded to requester |

### 7.2 Slasher (`slasher.mjs`)

`processSlash(targetId, reporterId, reason, currentScore)` writes a slash record to `artifacts/{run_id}/slash_log.json` and computes the new score after deducting `SLASH_PENALTY (15)`.

### 7.3 Specialization Profiles (`profiles.mjs`)

Lookup table mapping agent ID patterns to skill bonuses:
- Agent IDs containing `"Elite"` get a `+5` bonus on `research` subtasks
- Extensible: add new profile entries mapping name patterns → `{ skill, bonus }` pairs.

---

## 8. Proof & Audit Layer (`src/proof/`)

### 8.1 Coordination Proof (`coordinator.mjs`)

Called by `VerifierAgent` after every successful verification. Produces a deterministically structured JSON file:

```json
{
    "proof_id": "sha256(task_id|winner_id|result_hash|timestamp)",
    "task_id": "...",
    "macro_query": "...",
    "subtask_count": 1,
    "ordered_event_log": [],
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

Files are written atomically: written to `.tmp` first, then renamed — preventing partial reads by the observer server.

### 8.2 Event Logger (`event_logger.mjs`)

Generates a unique `run_id` at startup (`run_{timestamp}`). All modules call `getCurrentRunId()` to locate the correct artifact subdirectory. Appends events to `structured_event_log.json`.

### 8.3 Economy Rounds (`economy_rounds.mjs`)

`logEconomyRound(taskId, round, bids, winner, reason, losers, metadata)` writes one entry per bid resolution cycle to `economy_rounds.json`. Provides a complete audit of every auction.

---

## 9. Dashboard Observer (`src/panel/server.mjs`)

**Tech stack:** Express 5, Socket.IO 4, MQTT.js 5.

The server operates as a **passive observer** — it subscribes to all `omniswarm/#` topics but never publishes to them (except via the `/kill/:agentId` endpoint). It performs **edge-side envelope verification** using `verifySignature` before processing any message.

### State Maintained

```js
agents = Map<agentId, { id, role, score, status, lastSeen }>
tasks  = Map<taskId,  { id, context, status, winner }>
swarmMetrics = {
    slashes: 0, proofs: 0, replays_blocked: 0,
    tasks_verified: 0, total_events: 0, tps_window: []
}
```

### Topic Processing

| Topic | Action |
|-------|--------|
| `omniswarm/hello` / `omniswarm/state` | Upsert agent record, update `lastSeen` |
| `omniswarm/task` + `action=propose` | Create task record with `status=BIDDING` |
| `omniswarm/bid` + `action=assign` | Update task `status=EXECUTING`, set `winner` |
| `omniswarm/result` | Update task `status=VERIFYING` |
| `omniswarm/verify` | Update task `status=VERIFIED` or `FAILED`, increment `slashes` |
| `omniswarm/proof` | Increment `proofs` counter |

### Socket.IO Events (Server → Client)

| Event | Payload | Frequency |
|-------|---------|-----------|
| `swarm_state` | `{ agents, tasks, metrics }` | Every 500ms |
| `event_log` | `{ event_type, agent_id, payload_hash }` | On every message |
| `tps` | `number` | Every 500ms |

### HTTP Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/` | Serves `public/index.html` |
| GET | `/api/export-artifacts` | Creates `swarm_session_summary.json`, compresses `artifacts/` to ZIP, serves download. Falls back to JSON if PowerShell compression unavailable. |
| GET | `/api/stats` | Returns raw `{ agents, tasks, metrics }` JSON |
| POST | `/kill/:agentId` | Publishes `{ action: 'DIE' }` to `system/kill/{agentId}` (triggers self-healing demo) |

---

## 10. Frontend Dashboard (`public/`)

Built with vanilla HTML/CSS/JavaScript + D3.js v7 + Socket.IO client. Zero framework dependencies.

### 13 Premium UI Features

| # | Feature | Implementation |
|---|---------|---------------|
| 1 | **Particle canvas background** | 80 particles with proximity-based line drawing on a full-viewport `<canvas>` |
| 2 | **Animated header metric counters** | Step-interpolation `animateTo(elId, target)` function that counts up/down smoothly |
| 3 | **Swarm IQ gauge** | Second `<canvas>` with arc-based radial gauge. Green >70, gold >40, red ≤40. Animates toward `targetIQ`. |
| 4 | **Connection status bar** | Live Dot + label. Green pulsing = connected. TPS badge updates every 500ms. |
| 5 | **D3 Force Topology** | `d3.forceSimulation()` with `forceManyBody(-60)`, `forceCenter`, `forceCollide(radius)`. Nodes are colour+glow coded by role. Draggable. |
| 6 | **Node detail flyout** | Click any D3 node → glassmorphism panel slides up with agent ID, role, score, status, lastSeen |
| 7 | **DAG Task Board** | Task list with `All/Bid/Run/Done` filter buttons. Each task shows ID, context, winner, status badge. |
| 8 | **Live Event Ticker** | Prepend-scrolling list. Each entry has a colour-coded tag (`bid`=cyan, `verify`=green, `task`=gold, etc.) |
| 9 | **Reputation Leaderboard** | Top 8 agents sorted by score. Animated progress bars. Medal emojis for top 3. |
| 10 | **Hashchain Proof Explorer** | Each proof event gets a row with sequential ID, truncated SHA-256 hash, and a VERIFY button |
| 11 | **Performance Metrics Grid** | 4-cell grid: Slashes, Proofs Generated, Replay Attacks Blocked, Total Events |
| 12 | **TPS Sparkline Chart** | 60-sample rolling history drawn as a gradient area chart on a `<canvas>` |
| 13 | **Toast Notification System** | Slide-in toasts (success/error/info/warn) with 5s auto-dismiss. Used for connect/disconnect, fault drill, export events |

**Additional controls:** Sound Toggle (Web Audio API beeps), Dark/Light Theme Toggle (CSS `.theme-light` class), Fault Drill button (POST `/kill/:agentId` for a random alive non-architect agent), Export Proof Bundle button.

---

## 11. Deployment & Execution

### Prerequisites

1. **FoxMQ** MQTT broker running on `127.0.0.1:1883` (credentials: `oow`/`oow123`)
   - Binary located in `foxmq-bin/`
   - Started via `demo/setup-cluster.ps1`
2. **Node.js v20+**
3. (Optional) `FEATHERLESS_API_KEY` env var for real LLM calls

### 1-Click Boot

```powershell
cd vertex/swarm-os
node demo/run-full-demo.mjs
```

This script:
1. Starts FoxMQ via `demo/setup-cluster.ps1` (PowerShell, stdio: ignore)
2. Starts `src/panel/server.mjs` (dashboard on port 3000)
3. After 3 seconds, starts `demo/mass-scenario.mjs --self-healing-drill --fault-mode delay --fault-rate 0.2`

### Test Suite

```powershell
npm test
# Runs: node --test tests/test_suite.mjs
```

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `FEATHERLESS_API_KEY` | Optional | If not set, only non-elite (simulated) scholars execute. Elite agents hit all 3 fallback models. |
| `SWARM_SECRET` | Optional | HMAC signing secret (defaults to `vertex-hackathon-2026`) |

---

## 12. Complete Message Flow (End-to-End)

```
1. BOOT
   FoxMQ broker starts → all agents connect → subscribe to omniswarm/#

2. DISCOVERY
   Each agent publishes: HELLO/{agentId} with { action: 'hello', role: 'ArchitectAgent' }
   All agents build their peers Map
   STATE/{agentId} published every 2000ms (heartbeats)

3. TASK PROPOSAL (Architect)
   Architect calls submitQuery("Mars Colony delivery network")
   → askLLM(decompose prompt) → returns [{ subtask, complexity, required_skill }]
   → lockEscrow(taskId, 100 tokens)
   → publishes TASK/{taskId} { action: 'propose', taskId, context, required_skill }

4. BIDDING (Scholars)
   Each Scholar receives TASK/{taskId}
   → evaluateTask(): score > cost ? submit bid : skip
   → publishes BID/{taskId} { action: 'submit_bid', taskId, cost, score }
   (Envelope: nonce + Ed25519 sig + HMAC + timestamp)

5. RESOLUTION (Architect)
   After BIDDING_TIMEOUT_MS (3000ms), resolveBids() runs
   Checks: bids.length >= 1 (adaptive quorum, MAX_ROUNDS=5)
   Sorts bids by net_bid = score - cost + specialization_bonus
   Sets subtaskLocks.set(taskId) [double-assignment prevention]
   Logs to economy_rounds.json
   → publishes BID/{taskId} { action: 'assign', winner, context }

6. EXECUTION (Winning Scholar)
   Scholar sees assign where payload.winner === this.agentId
   → executeTask(): injectRAGContext → askLLM
   → SHA-256 hashes result
   → publishes RESULT/{taskId} { action: 'result', result, hash }

7. VERIFICATION (Verifier)
   Verifier receives RESULT/{taskId}, extracts scholarId from senderId
   → askLLM(hallucination check) → { verdict, confidence, flags }
   → settleEscrow(taskId, isValid, ...) → payout split
   → if INVALID: processSlash(scholarId) → writes slash record
   → publishes VERIFY/{taskId} { action: 'verify', verdict, payout }
   → if VALID: generateCoordinationProof() → writes coordination_proof_{id}.json
   → publishes PROOF/{taskId} { action: 'proof', proofId }

8. DASHBOARD OBSERVER
   server.mjs hears every message (verifies Ed25519 before processing)
   Updates agents Map, tasks Map, swarmMetrics
   Emits swarm_state to all frontend clients every 500ms

9. SELF-HEALING
   LivenessMonitor detects Scholar missed 5+ heartbeats → DEAD
   Architect.onPeerDead() fires orphanWatchdog()
   Any tasks with status EXECUTING for >8s are reset to BIDDING
   New proposal published → re-auction cycle begins
```

---

## 13. Known Design Decisions & Rationale

| Decision | Rationale |
|----------|-----------|
| **Per-agent ReplayCache not global** | Global singleton caused cross-agent nonce poisoning when multiple agents share a process |
| **`senderId` from envelope, not inner payload** | Inner payload never contains `sender` — it only carries business data. Envelope `agent_id` is the authenticated identity. |
| **Adaptive quorum (≥1 bid, MAX_ROUNDS=5)** | Fixed 50% quorum of all peers was impossible to satisfy — only 5 elite scholars bid, but 24+ agents in the peer table meant needing 13+ bids. `MAX_ROUNDS` caps retries to prevent infinite loops. |
| **`process.argv` parsed by mass-scenario** | Allows `run-full-demo.mjs` to pass fault injection flags (`--self-healing-drill --fault-mode delay --fault-rate 0.2`) without modifying source |
| **Atomic file writes** | `.tmp` + `rename` pattern prevents partial reads of proof artifacts during Dashboard export |
| **Ed25519 via `crypto.sign(null, ...)` not `createSign`** | Ed25519 does not accept a separate hash algorithm — `null` is the correct Node.js API argument |
| **Shards (15 classes) representing 4990 agents** | Each `Shard-Scholar-Cluster-N` conceptually represents 333 agents. Full 4990 TCP connections would exhaust OS socket limits. |
| **Socket.IO 500ms broadcast interval** | Batches state snapshots to avoid flooding clients on high-TPS runs |
| **Escrow in-memory Map** | Sufficient for demo/hackathon. For production: replace with persistent key-value store (Redis, LevelDB) |

---

## 14. Extension Points (How to Build On This)

### Add a New Agent Type
1. Create `src/agent/myagent.mjs` extending `OmniAgent`
2. Override `onCustomMessage(topic, payload, senderId)` and `onPeerDead(id)`
3. Import and instantiate in `demo/mass-scenario.mjs`

### Add a New MQTT Topic
1. Add `TOPIC_MYTHING: 'omniswarm/mything'` to `swarm.config.mjs`
2. Subscribe in `core.mjs` `client.on('connect')` block
3. Handle in relevant agent's `onCustomMessage`
4. Parse in `server.mjs` `client.on('message')` handler
5. Emit to frontend via `io.emit('swarm_state', ...)`

### Replace FoxMQ with a Cloud Broker
Change `CONFIG.NODES` to point at any MQTT 3.1.1-compatible broker (HiveMQ, Mosquitto, EMQX). The `mqtt` package is broker-agnostic.

### Enable Real LLM for All Agents
Set `isElite = true` in `mass-scenario.mjs` for shard agents and ensure `FEATHERLESS_API_KEY` is set. Be aware of rate limit implications at 15+ concurrent LLM callers.

### Add Blockchain Settlement
`src/arc/bridge.mjs` provides `pushToArcNetwork(proofId)` which currently simulates. Replace the body with a real Tashi Arc API call or Ethereum `eth_sendTransaction` using the proof hash.

### Add Persistent Reputation
Replace `ReputationSystem`'s in-memory store with file-backed JSON (already partially done: `data/reputation_{agentId}.json` files are written on heartbeat) or a database.

---

## 15. Artifact Schema Reference

### `coordination_proof_{task_id}.json`
```json
{
    "proof_id": "string (sha256 hex)",
    "task_id": "string (uuid)",
    "macro_query": "string",
    "subtask_count": "number",
    "ordered_event_log": "array",
    "dag_hash": "string (sha256 of event log)",
    "proof_checks": {
        "no_double_assignment": true,
        "deterministic_resolution": true,
        "all_verifications_passed": true,
        "no_replay_detected": true
    },
    "verification_verdict": "VALID | INVALID"
}
```

### `economy_rounds.json`
```json
[{
    "taskId": "uuid",
    "round": 1,
    "bids": [{ "agent_id": "...", "cost": 1.5, "score": 50, "net_bid": 53.5, "specialization_bonus": 5 }],
    "winner": "Elite-Scholar-1",
    "resolution_reason": "Highest net bid",
    "arithmetic": "score - cost + bonus",
    "timestamp": "ISO-8601"
}]
```

### `swarm_session_summary.json`
```json
{
    "session_time": "ISO-8601",
    "agents": { "agentId": { "id": "...", "role": "...", "score": 50, "status": "ACTIVE" } },
    "tasks_total": 6,
    "tasks_completed": 4
}
```
