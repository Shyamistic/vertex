/**
 * OmniSwarm v4.0 Master Configuration
 * Consolidates network routing, cryptographic schemas, token economics,
 * AI endpoints, physics monitors, and game-theory parameters.
 */

export const CONFIG = {
    // Network Geometry
    NODES: [
        'mqtt://oow:oow123@127.0.0.1:1883'
    ],

    // PubSub Canonical Topics
    TOPIC_HELLO:     'omniswarm/hello',
    TOPIC_STATE:     'omniswarm/state',
    TOPIC_TASK:      'omniswarm/task',
    TOPIC_BID:       'omniswarm/bid',
    TOPIC_RESULT:    'omniswarm/result',
    TOPIC_VERIFY:    'omniswarm/verify',
    TOPIC_PROOF:     'omniswarm/proof',
    TOPIC_HIVE:      'omniswarm/hive',
    TOPIC_FEDERATED: 'omniswarm/federated',  // v4.0: federated learning updates
    TOPIC_A2A:       'omniswarm/a2a',         // v4.0: A2A agent cards

    // Core Engine Tuning
    HEARTBEAT_INTERVAL_MS: 2000,
    BIDDING_TIMEOUT_MS:    3000,
    COMMIT_PHASE_MS:       1500,   // v4.0: commit-reveal split
    REVEAL_PHASE_MS:       1500,
    NONCE_TTL_SECONDS:     30,

    // Token Economy
    COMPUTE_RATE_PER_TOKEN:  0.5,
    REPUTATION_DECAY_RATE:   0.98,
    DEFAULT_CREDIT_ESCROW:   100,

    // Byzantine Constraints
    SLASH_PENALTY:   15,
    QUORUM_RATIO:    0.5,

    // v4.0 Game Theory
    PNE_WEIGHTS:     [0.3, 0.5, 0.2],   // [speed_weight, quality_weight, cost_weight]
    USE_VCG:         true,               // Switch architect to VCG payments
    USE_COMMIT_REVEAL: false,            // Enable 2-round commit-reveal (slower but shill-resistant)

    // v4.0 Physics Thresholds
    LYAPUNOV_CRITICAL_DVDT:       100,  // dV/dt above which rebalancing triggers
    PERCOLATION_WARNING_RATIO:    0.8,  // f/fc ratio to emit warning
    FIEDLER_PARTITION_THRESHOLD:  0.1,  // λ₂ below which network is partitioned
    EPIDEMIC_EMERGENCY_R0:        1.5,  // R₀ above which verifier spawn triggered
    CHAOS_CSD_THRESHOLD:          50,   // CSD threshold for bifurcation warning
    VELOCITY_QE_THRESHOLD:        0.5,  // V below which QE stimulus triggers

    // Cloud Integration
    FEATHERLESS_API_KEY: process.env.FEATHERLESS_API_KEY || '',
    LLM_FALLBACK_CHAIN: [
        'meta-llama/Llama-3.3-70B-Instruct',
        'Qwen/Qwen2.5-72B-Instruct',
        'mistralai/Mistral-7B-Instruct-v0.3'
    ]
};
