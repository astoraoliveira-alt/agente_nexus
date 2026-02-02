/**
 * Davos Nexus - Consumption & Cost Logic
 * This file handles logic for projections, peak usage aggregation, and cost rules.
 */

import { ConsumptionMetrics, PeakUsageMatrix, ConsumptionSummary, Agent, AILifecycleStage } from './types';

/**
 * Rules for Cost Calculation (Standard Rates)
 * These would eventually be per-tenant/per-contract.
 */
export const COST_RATES = {
    llm_per_1k_tokens: 0.10, // R$ 0.10 por 1000 tokens
    stt_per_minute: 0.05,     // R$ 0.05 por minuto
    tts_per_minute: 0.05,     // R$ 0.05 por minuto
    message_base_cost: 0.01   // R$ 0.01 por mensagem processada
};

/**
 * PROJECTED USAGE (Etapa 2)
 * Calculates the projected end-of-cycle usage based on current data.
 * Formula: (currentUsage / elapsedDays) * totalDaysInCycle
 */
export const calculateProjection = (currentValue: number, totalLimit: number, elapsedDays: number) => {
    if (elapsedDays === 0) return 0;
    const daysInMonth = 30;
    const dailyAverage = currentValue / elapsedDays;
    const projectedEndValue = dailyAverage * daysInMonth;
    return (projectedEndValue / totalLimit) * 100;
};

/**
 * BILLABLE AUDIT RULE (Etapa 4)
 * Only production and monitoring stages are billable.
 */
export const isMetricBillable = (agentStage: AILifecycleStage): boolean => {
    return agentStage === 'production' || agentStage === 'monitoring';
};

/**
 * PEAK USAGE AGGREGATION (Etapa 3)
 */
export const aggregatePeakUsage = (events: ConsumptionMetrics[]): PeakUsageMatrix[] => {
    const matrix: Record<string, number> = {};
    let maxVolume = 0;

    events.forEach(event => {
        const date = new Date(event.timestamp);
        const day = date.getDay();
        const hour = date.getHours();
        const key = `${day}-${hour}`;

        matrix[key] = (matrix[key] || 0) + 1;
        if (matrix[key] > maxVolume) maxVolume = matrix[key];
    });

    const finalMatrix: PeakUsageMatrix[] = [];
    for (let d = 0; d < 7; d++) {
        for (let h = 0; h < 24; h++) {
            const count = matrix[`${d}-${h}`] || 0;
            finalMatrix.push({
                dayOfWeek: d,
                hourOfDay: h,
                eventCount: count,
                intensity: maxVolume > 0 ? count / maxVolume : 0
            });
        }
    }

    return finalMatrix;
};

/**
 * TENANT AGGREGATION LOGIC (Etapa 1.2)
 * Derive stats from events instead of hardcoded fields.
 */
export const getTenantAggregatedStats = (tenantId: string, metrics: ConsumptionMetrics[], agents: Agent[], users: any[]) => {
    const tenantMetrics = metrics.filter(m => m.tenantId === tenantId);
    const tenantAgents = agents.filter(a => a.tenantId === tenantId);
    const tenantUsers = users.filter(u => u.tenantId === tenantId);

    const totalTokens = tenantMetrics
        .filter(m => m.metricType === 'tokens')
        .reduce((sum, m) => sum + m.value, 0);

    const totalMessages = tenantMetrics
        .filter(m => m.metricType === 'messages')
        .reduce((sum, m) => sum + m.value, 0);

    return {
        agentsCount: tenantAgents.length,
        usersCount: tenantUsers.length,
        tokensCount: totalTokens,
        messagesCount: totalMessages,
        totalCost: tenantMetrics.reduce((sum, m) => sum + m.cost, 0)
    };
};

/**
 * ISO STATUS CALCULATION (Etapa 4)
 * Defined -> All requirements met
 * Pending -> Missing some requirements
 * Non-compliant -> Active without governance
 */
export const calculateISOStatus = (tenant: any): 'conform' | 'pending' | 'critical' => {
    if (!tenant.isoStatus) return 'critical';

    const hasResponsibles = tenant.isoStatus.aiSystemOwnerId && tenant.isoStatus.riskOwnerId;
    const hasPolicies = tenant.isoStatus.lifecyclePolicyDefined && tenant.isoStatus.riskMethodologyDefined;

    if (hasResponsibles && hasPolicies) return 'conform';
    if (tenant.status === 'active' && !hasResponsibles) return 'critical';
    return 'pending';
};

/**
 * N8N INTEGRATION PAYLOAD (Etapa 7)
 * Defines the contract for external event ingestion.
 */
export interface N8NConsumptionPayload {
    tenant_id: string;
    agent_id: string;
    channel: 'whatsapp' | 'voice' | 'web';
    event: 'message.received' | 'call.started' | 'transcript.generated';
    tokens: number;
    stt_minutes: number;
    tts_minutes: number;
    timestamp: string; // ISO-8601
}

/**
 * Helper to generate a consumption entry from a raw integration event.
 */
export const processIntegrationEvent = (payload: N8NConsumptionPayload): ConsumptionMetrics[] => {
    const metrics: ConsumptionMetrics[] = [];
    const baseId = `metric-${Date.now()}`;

    if (payload.tokens > 0) {
        metrics.push({
            id: `${baseId}-llm`,
            tenantId: payload.tenant_id,
            agentId: payload.agent_id,
            channel: payload.channel as any,
            metricType: 'tokens',
            value: payload.tokens,
            unit: 'tokens',
            cost: (payload.tokens / 1000) * COST_RATES.llm_per_1k_tokens,
            timestamp: new Date(payload.timestamp)
        });
    }

    if (payload.stt_minutes > 0) {
        metrics.push({
            id: `${baseId}-stt`,
            tenantId: payload.tenant_id,
            agentId: payload.agent_id,
            channel: payload.channel as any,
            metricType: 'stt_minutes',
            value: payload.stt_minutes,
            unit: 'minutes',
            cost: payload.stt_minutes * COST_RATES.stt_per_minute,
            timestamp: new Date(payload.timestamp)
        });
    }

    return metrics;
};
