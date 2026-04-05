import test from 'node:test';
import assert from 'node:assert';
import { lockEscrow, settleEscrow } from '../src/economy/escrow.mjs';
import { isReplay } from '../src/security/replay.mjs';
import { getOrGenerateIdentity, signPayload, verifySignature } from '../src/security/identity.mjs';
import { computeSpecializationBonus, registerAgentProfile } from '../src/economy/profiles.mjs';

test('Security Matrix - Sliding Nonce TTL', () => {
    assert.strictEqual(isReplay('nonce_1', Date.now()), false);
    assert.strictEqual(isReplay('nonce_1', Date.now()), true); // duplicate caught
    assert.strictEqual(isReplay('nonce_2', Date.now() - 60000), true); // stale caught
});

test('Security Matrix - Ed25519 Infrastructure', async () => {
    const keys = await getOrGenerateIdentity('test_agent_1');
    const sig = signPayload({ test: true }, keys.privateKey);
    assert.strictEqual(verifySignature({ test: true }, sig, keys.publicKey), true);
    assert.strictEqual(verifySignature({ test: false }, sig, keys.publicKey), false); // Malformed
});

test('Economic Engine - Escrow Disbursement', () => {
    lockEscrow('task_123', 'architect_1', 100);
    const split = settleEscrow('task_123', true, 'scholar_1', 'verifier_1', 'architect_1');
    assert.strictEqual(split.scholar.amount, 35);
    assert.strictEqual(split.burn, 5);
});

test('Economic Engine - Agent Specializations', () => {
    registerAgentProfile('ai_coder', ['code_gen', 'research']);
    assert.strictEqual(computeSpecializationBonus('ai_coder', 'code_gen'), 15);
    assert.strictEqual(computeSpecializationBonus('ai_coder', 'combat'), 0);
});
