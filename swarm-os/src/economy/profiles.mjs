export const AGENT_PROFILES = new Map();

/**
 * Registers an agent's specialties logically ensuring tasks can route to optimized hubs.
 */
export function registerAgentProfile(agentId, specializations) {
    AGENT_PROFILES.set(agentId, specializations || []);
}

export function computeSpecializationBonus(agentId, requiredSkill) {
    if (!requiredSkill) return 0;
    const skills = AGENT_PROFILES.get(agentId) || [];
    if (skills.includes(requiredSkill)) {
        return 15; // +15 flat mathematical score adjustment
    }
    return 0;
}
