const memoryVectorStore = []; // Array of [{text, vector:[...]}]

function getTermFrequency(text) {
    const tokens = text.toLowerCase().match(/\w+/g) || [];
    const freqs = {};
    for (const t of tokens) freqs[t] = (freqs[t] || 0) + 1;
    return freqs;
}

function cosineSimilarity(freqA, freqB) {
    let dotProduct = 0;
    let magA = 0;
    let magB = 0;
    for (const key in freqA) {
        dotProduct += freqA[key] * (freqB[key] || 0);
        magA += freqA[key] * freqA[key];
    }
    for (const key in freqB) {
        magB += freqB[key] * freqB[key];
    }
    return magA && magB ? dotProduct / (Math.sqrt(magA) * Math.sqrt(magB)) : 0;
}

/**
 * Super lightweight similarity lookup designed natively lacking external DB overheads.
 */
export function injectRAGContext(prompt) {
    if (memoryVectorStore.length === 0) return prompt;

    const baseVec = getTermFrequency(prompt);
    const scored = memoryVectorStore.map(item => ({
        text: item.text,
        score: cosineSimilarity(baseVec, item.vector)
    }));

    scored.sort((a, b) => b.score - a.score);
    const topContexts = scored.slice(0, 3).map(s => s.text);
    
    // Hardcap memory boundary
    if(memoryVectorStore.length > 50) memoryVectorStore.shift();
    
    return `PAST CONTEXT:\n${topContexts.join('\n')}\n\nNEW TASK:\n${prompt}`;
}

export function saveToRAGMemory(resultText) {
    memoryVectorStore.push({
        text: resultText,
        vector: getTermFrequency(resultText)
    });
}
