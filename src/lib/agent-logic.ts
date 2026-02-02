import { Agent, AILifecycleStage } from './types';

/**
 * Davos Nexus - Agent Functional Logic & Constraints
 * This file defines the behavior rules derived from the Agent Contract.
 * These rules should be enforced by the backend, but are declared here 
 * to provide immediate feedback and prepare the system for integration.
 */

/**
 * Rules for Lifecycle Stages (ISO 42001)
 */
export const LIFECYCLE_RULES: Record<AILifecycleStage, {
    canDispatch: boolean,
    canAccessExternalTools: boolean,
    environment: 'sandbox' | 'production' | 'none'
}> = {
    development: {
        canDispatch: false,
        canAccessExternalTools: false,
        environment: 'sandbox'
    },
    validation: {
        canDispatch: true,
        canAccessExternalTools: true,
        environment: 'sandbox'
    },
    production: {
        canDispatch: true,
        canAccessExternalTools: true,
        environment: 'production'
    },
    monitoring: {
        canDispatch: true,
        canAccessExternalTools: true,
        environment: 'production'
    },
    retired: {
        canDispatch: false,
        canAccessExternalTools: false,
        environment: 'none'
    }
};

/**
 * Rules for Risk Levels (ISO 23894)
 */
export const RISK_RULES: Record<Agent['riskLevel'], {
    humanFallbackRequired: boolean,
    auditFrequencyDays: number,
    autonomyCap: number
}> = {
    low: {
        humanFallbackRequired: false,
        auditFrequencyDays: 30,
        autonomyCap: 5 // Full freedom
    },
    medium: {
        humanFallbackRequired: true,
        auditFrequencyDays: 15,
        autonomyCap: 4
    },
    high: {
        humanFallbackRequired: true,
        auditFrequencyDays: 7,
        autonomyCap: 2 // High Risk cap
    }
};

/**
 * INVOKE VALIDATION (Functional Contract)
 * Rules for deciding if an agent can be triggered.
 */
export const canInvokeAgent = (
    agent: Agent,
    tenantPlan: any,
    currentUsage: { tokens: number, messages: number, agentsCount: number }
): { canInvoke: boolean, reason?: string, type: 'error' | 'warning' | 'ok' } => {

    // 1. Lifecycle Check
    const rules = LIFECYCLE_RULES[agent.lifecycleStage];
    if (!rules.canDispatch) {
        return {
            canInvoke: false,
            reason: `Agente bloqueado devido ao estágio de ciclo de vida: ${agent.lifecycleStage}`,
            type: 'error'
        };
    }

    // 2. Risk vs Autonomy Check (Functional Impact)
    const riskRule = RISK_RULES[agent.riskLevel];
    if (agent.autonomyLevel > riskRule.autonomyCap) {
        return {
            canInvoke: false,
            reason: `Risco ${agent.riskLevel} proíbe autonomia nível ${agent.autonomyLevel}. Máximo permitido: ${riskRule.autonomyCap}`,
            type: 'error'
        };
    }

    // 3. Plan Limits Check (if fixed or overage policy is block)
    const isFixed = tenantPlan.type === 'fixed';
    const isBlockPolicy = tenantPlan.overagePolicy === 'block';

    if (isFixed || isBlockPolicy) {
        const limits = tenantPlan.hardLimits || tenantPlan.limits;
        if (limits) {
            if (currentUsage.tokens >= limits.llmTokens) {
                return { canInvoke: false, reason: 'Limite de tokens LLM atingido.', type: 'error' };
            }
            if (currentUsage.messages >= limits.messages) {
                return { canInvoke: false, reason: 'Limite de mensagens atingido.', type: 'error' };
            }
        }
    }

    // 4. Flex Alerts
    if (tenantPlan.type === 'flex' && tenantPlan.overagePolicy !== 'block') {
        const limits = tenantPlan.hardLimits || tenantPlan.limits;
        if (limits && (currentUsage.tokens >= limits.llmTokens || currentUsage.messages >= limits.messages)) {
            return { canInvoke: true, reason: 'Tenant em modo Overage (faturamento adicional ativo).', type: 'warning' };
        }
    }

    return { canInvoke: true, type: 'ok' };
};

/**
 * Payload Generator for External Integrations (N8N / Retell AI)
 * This is the official "Agent Contract" format.
 */
export const generateAgentContractPayload = (agent: Agent, tenantSlug: string) => {
    return {
        event: 'agent.provision',
        tenant_slug: tenantSlug,
        agent_id: agent.id,
        config: {
            lifecycle_stage: agent.lifecycleStage,
            autonomy_level: agent.autonomyLevel,
            max_concurrency: agent.maxConcurrentConversations,
            supported_channels: agent.channels,
            system_prompt: "...",
            n8n_webhook_url: agent.integration?.n8n_webhook_url,
            voice_provider: agent.integration?.voice_provider
        },
        risk_profile: {
            level: agent.riskLevel,
            score: agent.riskScore,
        },
        governance: {
            sandbox_mode: LIFECYCLE_RULES[agent.lifecycleStage].environment === 'sandbox',
            block_external_dispatch: !LIFECYCLE_RULES[agent.lifecycleStage].canDispatch,
            enforce_human_handoff: RISK_RULES[agent.riskLevel].humanFallbackRequired,
            autonomy_cap: RISK_RULES[agent.riskLevel].autonomyCap,
            policies: agent.policies
        }
    };
};

/**
 * INTEGATION CONTRACTS (JSON)
 * 
 * Event: message.received
 * ```json
 * {
 *   "tenant_slug": "banco-alpha",
 *   "agent_id": "agent-1",
 *   "channel": "whatsapp",
 *   "external_id": "WA_SID_123",
 *   "content": "...",
 *   "timestamp": "2024-02-02T..."
 * }
 * ```
 * 
 * Event: voice.call.started
 * ```json
 * {
 *   "tenant_slug": "banco-alpha",
 *   "agent_id": "agent-1",
 *   "channel": "voice",
 *   "external_id": "retell_call_idxxx",
 *   "metadata": { "from": "+55...", "to": "+55..." },
 *   "timestamp": "2024-02-02T..."
 * }
 * ```
 */
