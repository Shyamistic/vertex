/**
 * OMNISWARM v4.0 — Kolmogorov Complexity Task Difficulty Estimator
 *
 * Estimates task computational difficulty using compressibility as a proxy
 * for Kolmogorov complexity. Drives principled escrow pricing.
 *
 * MATHEMATICS:
 *   Kolmogorov complexity K(x) = length of shortest program producing x
 *   K(x) is uncomputable in general (halting problem reduction).
 *
 *   Compressibility proxy:
 *     K̂(x) ≈ |gzip(x)|  (well-known MDL approximation, Rissanen 1989)
 *
 *   Compressibility ratio:
 *     ρ = |gzip(task_text)| / |task_text| ∈ (0, 1]
 *     ρ → 0 : maximally compressible → trivial, repetitive task
 *     ρ → 1 : incompressible → novel, complex task (approaches true K)
 *
 *   Task credit:
 *     credit = BASE_CREDIT × (0.5 + ρ/2)
 *   Range: [0.5 × BASE_CREDIT, 1.0 × BASE_CREDIT]
 *   (A complex task costs up to 2× a trivial task)
 *
 *   Normalised complexity score (0–100):
 *     score = ρ × 100
 */

import zlib from 'node:zlib';
import { CONFIG } from '../../config/swarm.config.mjs';

/**
 * Estimate Kolmogorov complexity of text via gzip compression.
 * @param {string} taskText
 * @returns {{ raw_bytes: number, compressed_bytes: number, rho: number, estimated_credit: number, complexity_score: number }}
 */
export function estimateComplexity(taskText) {
    const raw = Buffer.from(taskText || '', 'utf8');
    const raw_bytes = raw.length;

    if (raw_bytes === 0) {
        return { raw_bytes: 0, compressed_bytes: 0, rho: 0, estimated_credit: CONFIG.DEFAULT_CREDIT_ESCROW * 0.5, complexity_score: 0 };
    }

    let compressed_bytes;
    try {
        compressed_bytes = zlib.gzipSync(raw, { level: 9 }).length;
    } catch {
        compressed_bytes = raw_bytes; // fallback: assume incompressible
    }

    // gzip has ~18-byte header overhead; normalise for very short inputs
    const adjusted_compressed = Math.max(10, compressed_bytes - 18);
    const rho = Math.min(1, adjusted_compressed / raw_bytes);

    const estimated_credit = CONFIG.DEFAULT_CREDIT_ESCROW * (0.5 + rho / 2);
    const complexity_score = Math.round(rho * 100);

    return { raw_bytes, compressed_bytes, rho: +rho.toFixed(4), estimated_credit: Math.round(estimated_credit), complexity_score };
}

/**
 * Compare two tasks by their Kolmogorov complexity.
 * Returns 1 if taskA is harder, -1 if taskB is harder, 0 if equal.
 */
export function compareComplexity(taskTextA, taskTextB) {
    const { rho: rhoA } = estimateComplexity(taskTextA);
    const { rho: rhoB } = estimateComplexity(taskTextB);
    return rhoA > rhoB ? 1 : rhoA < rhoB ? -1 : 0;
}
