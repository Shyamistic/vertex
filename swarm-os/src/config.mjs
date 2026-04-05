export const CONFIG = {
    // We connect agents to different nodes in the FoxMQ BFT cluster
    NODES: [
        'mqtt://oow:oow123@127.0.0.1:1883',
        'mqtt://oow:oow123@127.0.0.1:1884',
        'mqtt://oow:oow123@127.0.0.1:1885',
        'mqtt://oow:oow123@127.0.0.1:1886'
    ],
    // Secret key shared among the swarm for HMAC verification
    SWARM_SECRET: 'v3rt3x_s3cr3t_sw4rm_0mn1',
    // Timings
    BIDDING_TIMEOUT_MS: 3000,
    HEARTBEAT_INTERVAL_MS: 2000,
    EXECUTION_TIMEOUT_MS: 10000,
    VERIFICATION_TIMEOUT_MS: 5000,
    // Topics
    TOPIC_HELLO: 'omniswarm/hello',
    TOPIC_STATE: 'omniswarm/state',
    TOPIC_TASK: 'omniswarm/task',
    TOPIC_BID: 'omniswarm/bid',
    TOPIC_RESULT: 'omniswarm/result',
    TOPIC_VERIFY: 'omniswarm/verify',
    TOPIC_PROOF: 'omniswarm/proof',
    TOPIC_HIVE: 'omniswarm/hive/memory',
};
