import { supabase, supabaseReader } from '@/lib/supabase';
import { Agent, Company, ConversationalFlow, User, Conversation, PlanCatalog, Contact, KnowledgeItem } from '@/lib/types';

export const financialService = {
async getFinancialReport(month: number, year: number): Promise<import('@/lib/types').FinancialReportRecord[]> {
        const { data, error } = await supabaseReader
            .rpc('get_financial_report', { p_month: month, p_year: year });

        if (error) {
            console.error('Error fetching financial report:', error);
            return [];
        }

        if (!data) return [];

        return data.map((r: any) => ({
            tenantId: r.tenant_id,
            companyName: r.company_name,
            planName: r.plan_name,
            revenueFixed: Number(r.revenue_fixed || 0),
            revenueVariable: Number(r.revenue_variable || 0),
            costFixed: Number(r.cost_fixed || 0),
            costVariableLlm: Number(r.cost_variable_llm || 0),
            costVariableVoice: Number(r.cost_variable_voice || 0),
            costVariableOther: Number(r.cost_variable_other || 0),
            netMargin: Number(r.net_margin || 0)
        }));
    },
    async processBilling(month: number, year: number): Promise<void> {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) throw new Error('Não autenticado');

        const { error } = await supabase.functions.invoke('process-billing', {
            body: { month, year },
            headers: { Authorization: `Bearer ${session.access_token}` }
        });

        if (error) {
            console.error('Error triggering billing:', error);
            throw error;
        }
    },

    async getMetaBillingDispatchesReport(
        tenantId: string, 
        startDate: Date, 
        endDate: Date,
        campaignId?: string
    ): Promise<import('@/lib/types').MetaBillingDispatchItem[]> {
        const parseDateKey = (rawDate: any, name?: string): string => {
            if (name) {
                const m = name.match(/^(\d{2})\/([a-zA-Z]{3})/);
                if (m) {
                    const day = m[1];
                    const monStr = m[2].toLowerCase();
                    const monthMap: Record<string, string> = { jan: '01', fev: '02', mar: '03', abr: '04', mai: '05', jun: '06', jul: '07', ago: '08', set: '09', out: '10', nov: '11', dez: '12' };
                    const mon = monthMap[monStr] || '10';
                    return `2026-${mon}-${day}`;
                }
                const m2 = name.match(/(\d{2})\.(\d{2})/);
                if (m2) {
                    return `2026-${m2[2]}-${m2[1]}`;
                }
            }
            if (rawDate) {
                const d = new Date(rawDate);
                if (!isNaN(d.getTime())) {
                    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
                }
            }
            return '2026-10-01';
        };

        const startStr = `${startDate.getFullYear()}-${String(startDate.getMonth() + 1).padStart(2, '0')}-${String(startDate.getDate()).padStart(2, '0')}`;
        const endStr = `${endDate.getFullYear()}-${String(endDate.getMonth() + 1).padStart(2, '0')}-${String(endDate.getDate()).padStart(2, '0')}`;

        try {
            const aggMap = new Map<string, {
                dispatchDate: string;
                dispatchType: string;
                dispatchTypeLabel: string;
                attemptedCount: number;
                deliveredCount: number;
                readCount: number;
                repliedCount: number;
                failedCount: number;
            }>();

            // 1. Campanhas Iniciais: fonte oficial e idêntica ao Dashboard via get_credit_campaign_funnel_stats
            const { data: funnelStats, error: fErr } = await supabaseReader.rpc('get_credit_campaign_funnel_stats', {
                p_tenant_id: tenantId,
                p_campaign_ids: campaignId ? [campaignId] : null,
                p_start_date: startDate.toISOString()
            });

            if (!fErr && Array.isArray(funnelStats)) {
                funnelStats.forEach((c: any) => {
                    const enviados = Number(c.enviados || 0);
                    if (enviados > 0) {
                        const dateKey = parseDateKey(c.start_date, c.campaign_name);
                        if (dateKey >= startStr && dateKey <= endStr) {
                            const mapKey = `${dateKey}_campaign_initial`;
                            if (!aggMap.has(mapKey)) {
                                aggMap.set(mapKey, {
                                    dispatchDate: dateKey,
                                    dispatchType: 'campaign_initial',
                                    dispatchTypeLabel: 'Campanhas (Envio Inicial)',
                                    attemptedCount: 0,
                                    deliveredCount: 0,
                                    readCount: 0,
                                    repliedCount: 0,
                                    failedCount: 0
                                });
                            }
                            const item = aggMap.get(mapKey)!;
                            item.attemptedCount += enviados;
                            item.deliveredCount += Number(c.entregues || 0);
                            item.readCount += Number(c.lidas || 0);
                            item.repliedCount += Number(c.interagiram || 0);
                            item.failedCount += Math.max(0, enviados - Number(c.entregues || 0));
                        }
                    }
                });
            }

            // 2. Reengajamento: consultas focadas na outbound_queue dentro da faixa de datas
            let reengQuery = supabaseReader
                .from('outbound_queue')
                .select('reengagement_last_sent_at, status')
                .eq('tenant_id', tenantId)
                .gt('reengagement_attempt_count', 0)
                .gte('reengagement_last_sent_at', `${startStr}T00:00:00Z`)
                .lte('reengagement_last_sent_at', `${endStr}T23:59:59Z`)
                .limit(10000);

            if (campaignId) {
                reengQuery = reengQuery.eq('campaign_id', campaignId);
            }

            const { data: reengRows } = await reengQuery;
            (reengRows || []).forEach((r: any) => {
                if (!r.reengagement_last_sent_at) return;
                const d = new Date(r.reengagement_last_sent_at);
                const dateKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
                if (dateKey < startStr || dateKey > endStr) return;

                const mapKey = `${dateKey}_reengagement`;
                if (!aggMap.has(mapKey)) {
                    aggMap.set(mapKey, {
                        dispatchDate: dateKey,
                        dispatchType: 'reengagement',
                        dispatchTypeLabel: 'Reengajamento',
                        attemptedCount: 0,
                        deliveredCount: 0,
                        readCount: 0,
                        repliedCount: 0,
                        failedCount: 0
                    });
                }
                const item = aggMap.get(mapKey)!;
                item.attemptedCount++;

                const st = String(r.status || '').toLowerCase().trim();
                const isDelivered = ['sent', 'enviada', 'delivered', 'read', 'respondida', 'interagiu'].includes(st);
                if (isDelivered) item.deliveredCount++;
                if (['read', 'respondida', 'interagiu'].includes(st)) item.readCount++;
                if (['failed', 'error', 'undelivered'].includes(st)) item.failedCount++;
            });

            // 3. Aquecimento / Anti-Abandono de Funil
            let followupQuery = supabaseReader
                .from('outbound_queue')
                .select('created_at, sent_at, status')
                .eq('tenant_id', tenantId)
                .filter('metadata->>is_funnel_followup', 'eq', 'true')
                .gte('created_at', `${startStr}T00:00:00Z`)
                .lte('created_at', `${endStr}T23:59:59Z`)
                .limit(10000);

            if (campaignId) {
                followupQuery = followupQuery.eq('campaign_id', campaignId);
            }

            const { data: followupRows } = await followupQuery;
            (followupRows || []).forEach((r: any) => {
                const rawDate = r.sent_at || r.created_at;
                if (!rawDate) return;
                const d = new Date(rawDate);
                const dateKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
                if (dateKey < startStr || dateKey > endStr) return;

                const mapKey = `${dateKey}_funnel_followup`;
                if (!aggMap.has(mapKey)) {
                    aggMap.set(mapKey, {
                        dispatchDate: dateKey,
                        dispatchType: 'funnel_followup',
                        dispatchTypeLabel: 'Aquecimento / Anti-Abandono',
                        attemptedCount: 0,
                        deliveredCount: 0,
                        readCount: 0,
                        repliedCount: 0,
                        failedCount: 0
                    });
                }
                const item = aggMap.get(mapKey)!;
                item.attemptedCount++;

                const st = String(r.status || '').toLowerCase().trim();
                const isDelivered = ['sent', 'enviada', 'delivered', 'read', 'respondida', 'interagiu'].includes(st);
                if (isDelivered) item.deliveredCount++;
                if (['read', 'respondida', 'interagiu'].includes(st)) item.readCount++;
                if (['failed', 'error', 'undelivered'].includes(st)) item.failedCount++;
            });

            // 4. Monta resultado final com taxas e valores
            const list = Array.from(aggMap.values()).map(item => {
                const deliveryRate = item.attemptedCount > 0 
                    ? Number(((item.deliveredCount / item.attemptedCount) * 100).toFixed(1)) 
                    : 0;
                return {
                    ...item,
                    deliveryRate,
                    unitPrice: 1.05,
                    totalCost: item.attemptedCount * 1.05
                };
            });

            list.sort((a, b) => b.dispatchDate.localeCompare(a.dispatchDate) || a.dispatchType.localeCompare(b.dispatchType));
            return list;
        } catch (err) {
            console.error('Erro ao consolidar relatório de faturamento Meta:', err);
            return [];
        }
    }
};

