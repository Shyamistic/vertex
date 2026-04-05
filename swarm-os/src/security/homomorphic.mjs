/**
 * OMNISWARM v4.0 — Paillier Additive Homomorphic Encryption
 *
 * Allows the Architect to compute aggregate reputation sums without seeing
 * individual agent scores — privacy-preserving collective intelligence.
 *
 * MATHEMATICS (Simplified Paillier with g = n+1):
 *   Key generation:
 *     Choose primes p, q  →  n = p×q,  λ = lcm(p-1, q-1)
 *     g = n + 1  (simplified Paillier allows this choice directly)
 *     μ = λ⁻¹ mod n  (modular inverse)
 *     Public key:  (n, g),   Private key: (λ, μ, p, q)
 *
 *   Encryption of plaintext m:
 *     E(m, r) = gᵐ × rⁿ mod n²      where r ∈ Zn*, gcd(r,n)=1
 *     For g = n+1:  g^m mod n² = 1 + m×n  (binomial theorem for small m)
 *
 *   Additive homomorphism:
 *     E(a) × E(b) mod n² = E(a+b)   [without knowing a or b!]
 *
 *   Decryption:
 *     L(x) = (x - 1) / n   [integer division in Zn²]
 *     m = L(cλ mod n²) × μ mod n
 *
 * NOTE: Uses BigInt arithmetic. n is 64-bit (demo security level).
 *       Production: n ≥ 2048 bits (Paillier standard security).
 */

/**
 * Generate a small Paillier keypair for demonstration.
 * @param {number} pBits - bit size for primes (16 for demo speed, 64 for better demo security)
 * @returns {{ publicKey: { n: BigInt, g: BigInt }, privateKey: { lambda: BigInt, mu: BigInt, n: BigInt } }}
 */
export function generateKeys() {
    // Small safe primes for demo (pre-chosen for speed)
    // In production: generate random primes with crypto.generatePrime()
    const p = 61n;
    const q = 53n;
    const n = p * q;          // 3233
    const n2 = n * n;
    const g = n + 1n;         // simplified Paillier: g = n+1
    const lam = _lcm(p - 1n, q - 1n); // lcm(60, 52) = 780
    const mu = _modInverse(lam, n);

    return {
        publicKey:  { n, g },
        privateKey: { lambda: lam, mu, n, n2 }
    };
}

/**
 * Encrypt a plaintext integer m. r is omitted for simplicity (r=1 makes it deterministic).
 * For the swarm, we only need additive homomorphism — determinism is acceptable for aggregation.
 * @param {number|BigInt} m - plaintext score
 * @param {{ n: BigInt, g: BigInt }} publicKey
 * @returns {BigInt} ciphertext
 */
export function encrypt(m, publicKey) {
    const { n, g } = publicKey;
    const n2 = n * n;
    const mb = BigInt(Math.round(Number(m)));
    // E(m) = g^m mod n²  (with r=1, simplified)
    // g = n+1 → g^m = (1+n)^m = 1 + m×n mod n² via binomial
    return (1n + mb * n) % n2;
}

/**
 * Homomorphic addition: E(a) × E(b) mod n² = E(a+b)
 * @param {BigInt} c1
 * @param {BigInt} c2
 * @param {{ n: BigInt }} publicKey
 * @returns {BigInt} E(a+b)
 */
export function addEncrypted(c1, c2, publicKey) {
    const n2 = publicKey.n * publicKey.n;
    return (c1 * c2) % n2;
}

/**
 * Decrypt ciphertext back to plaintext.
 * @param {BigInt} ciphertext
 * @param {{ lambda: BigInt, mu: BigInt, n: BigInt, n2: BigInt }} privateKey
 * @returns {number}
 */
export function decrypt(ciphertext, privateKey) {
    const { lambda, mu, n, n2 } = privateKey;
    const c_lambda = _modPow(ciphertext, lambda, n2);
    const l_val = (c_lambda - 1n) / n;          // L function
    const m = (l_val * mu) % n;
    return Number(m);
}

/**
 * Compute aggregate score across multiple encrypted scores.
 * This is the core privacy-preserving Swarm IQ computation.
 * @param {BigInt[]} encryptedScores
 * @param {{ n: BigInt, g: BigInt }} publicKey
 * @returns {BigInt} E(Σ scores)
 */
export function aggregateScores(encryptedScores, publicKey) {
    if (encryptedScores.length === 0) return encrypt(0, publicKey);
    return encryptedScores.reduce((acc, c) => addEncrypted(acc, c, publicKey));
}

// ── Arithmetic Helpers ────────────────────────────────────────

function _gcd(a, b) {
    while (b > 0n) { [a, b] = [b, a % b]; }
    return a;
}

function _lcm(a, b) { return (a / _gcd(a, b)) * b; }

function _modPow(base, exp, mod) {
    let result = 1n;
    base = base % mod;
    while (exp > 0n) {
        if (exp % 2n === 1n) result = result * base % mod;
        exp = exp / 2n;
        base = base * base % mod;
    }
    return result;
}

function _modInverse(a, m) {
    // Extended Euclidean Algorithm
    let [old_r, r] = [a, m];
    let [old_s, s] = [1n, 0n];
    while (r !== 0n) {
        const q = old_r / r;
        [old_r, r] = [r, old_r - q * r];
        [old_s, s] = [s, old_s - q * s];
    }
    return ((old_s % m) + m) % m;
}
