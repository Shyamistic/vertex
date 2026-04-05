import OpenAI from 'openai';
import crypto from 'node:crypto';
import { CONFIG } from '../../config/swarm.config.mjs';

const openai = new OpenAI({
    baseURL: 'https://api.featherless.ai/v1',
    apiKey: CONFIG.FEATHERLESS_API_KEY
});

// Cache map: hash -> { response, timestamp }
const llmCache = new Map();

/**
 * Robust fallback-chain cognitive executor bridging the gap directly 
 * to multi-agent architectures independently protecting API keys.
 */
export async function askLLM(prompt, context = "You are a decentralized agent in OmniSwarm.", isElite = false) {
    if (!isElite) {
        return `*[DEEP-THINK-LLM] [Simulated Response] Computed analytical synthesis mapping.*`;
    }

    const payloadHash = crypto.createHash('sha256').update(prompt + context).digest('hex');
    
    // Feature 25 - LLM Response Cache (60s TTL)
    if (llmCache.has(payloadHash)) {
        const entry = llmCache.get(payloadHash);
        if (Date.now() - entry.timestamp < 60000) {
            console.log(`[Cognitive] LLM_CACHE_HIT`);
            return entry.response;
        } else {
            llmCache.delete(payloadHash);
        }
    }

    let errorContext = null;
    
    // Feature 24 - Multi-LLM Fallback Chain
    for (const modelId of CONFIG.LLM_FALLBACK_CHAIN) {
        try {
            console.log(`[Cognitive] Querying Engine: ${modelId}`);
            const response = await openai.chat.completions.create({
                model: modelId,
                messages: [
                    { role: 'system', content: context },
                    { role: 'user', content: prompt }
                ],
                max_tokens: 300,
                timeout: 8000
            });
            
            const result = response.choices[0].message.content.trim();
            llmCache.set(payloadHash, { response: result, timestamp: Date.now() });
            
            return result;
        } catch (e) {
            errorContext = e.message;
            console.log(`[Cognitive] Edge block on ${modelId}. Shifting sequence fallback...`);
        }
    }

    return `[Cognitive Failure] Fallback routing exhausted. Last Error: ${errorContext}`;
}
