/**
 * Testing mechanism that executes Byzantine chaos natively within memory instances.
 */
let faultMode = 'none';
let faultRate = 0.0;

export function configureFaults(mode, rate) {
    faultMode = mode || 'none';
    faultRate = rate || 0.0;
}

/**
 * Filter mechanism to selectively intercept operations
 * @returns {boolean} True if the message should be swallowed/blocked.
 */
export function interceptMessage(topic, payload) {
    if (faultMode === 'none') return false;

    if (faultMode === 'drop' && Math.random() < faultRate) {
        // Silently drop
        return true; 
    }
    
    return false;
}

export function manipulateBidCost(originalCost) {
    if (faultMode === 'manipulate' && Math.random() < faultRate) {
        return originalCost - 100; // Unreasonably malicious underbidding 
    }
    return originalCost;
}

export async function simulateDelay() {
    if (faultMode === 'delay' && Math.random() < faultRate) {
        return new Promise(r => setTimeout(r, 2000));
    }
}
