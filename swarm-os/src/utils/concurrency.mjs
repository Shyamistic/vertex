/**
 * Simple Async Mutex to serialize access to shared resources (like files)
 * in a high-concurrency Node.js environment.
 */
export class AsyncMutex {
    constructor() {
        this.queue = Promise.resolve();
    }

    /**
     * Executes the given async task when the previous task in the queue finishes.
     * @param {Function} task - Async function to run
     * @returns {Promise<any>} Result of the task
     */
    run(task) {
        const next = this.queue.then(() => task());
        // Update the queue but don't let a failure in one task block subsequent ones
        this.queue = next.catch(() => {});
        return next;
    }
}

/**
 * Registry of named mutexes to avoid creating multiple locks for the same resource
 */
const mutexRegistry = new Map();

export function getMutex(name) {
    if (!mutexRegistry.has(name)) {
        mutexRegistry.set(name, new AsyncMutex());
    }
    return mutexRegistry.get(name);
}
