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
                p_start_date: startDate.toISOString(),
                p_agent_id: null
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
            } else {
                // Fallback paginado (1000 em 1000 - limite max_rows do PostgREST) quando a RPC excede statement timeout (57014)
                const { data: campsData } = await supabaseReader
                    .from('campaigns')
                    .select('id, name, start_date, created_at')
                    .eq('tenant_id', tenantId)
                    .gte('created_at', new Date(startDate.getTime() - 10 * 86400000).toISOString());

                const eligibleCamps = (campsData || []).filter((c: any) => {
                    if (campaignId && c.id !== campaignId) return false;
                    const dateKey = parseDateKey(c.start_date || c.created_at, c.name);
                    return dateKey >= startStr && dateKey <= endStr;
                });

                if (eligibleCamps.length > 0) {
                    const campById = new Map<string, any>();
                    eligibleCamps.forEach((c: any) => campById.set(c.id, c));
                    const eligibleCampIds = eligibleCamps.map((c: any) => c.id);

                    const oqInit: any[] = [];
                    const initPageSize = 1000;
                    for (let i = 0; i < eligibleCampIds.length; i += 10) {
                        const campChunk = eligibleCampIds.slice(i, i + 10);
                        let page = 0;
                        while (true) {
                            const { data: pageData, error: pageErr } = await supabaseReader
                                .from('outbound_queue')
                                .select('campaign_id, status, sent_at, response_detected')
                                .eq('tenant_id', tenantId)
                                .in('campaign_id', campChunk)
                                .range(page * initPageSize, (page + 1) * initPageSize - 1);

                            if (pageErr || !pageData || pageData.length === 0) break;
                            oqInit.push(...pageData);
                            if (pageData.length < initPageSize) break;
                            page++;
                        }
                    }

                    oqInit.forEach((q: any) => {
                        const c = campById.get(q.campaign_id);
                        if (!c) return;
                        const st = String(q.status || '').trim().toLowerCase();
                        const isSent = !['queued', 'pending', 'scheduled', 'draft'].includes(st) || Boolean(q.response_detected) || Boolean(q.sent_at);
                        if (!isSent) return;

                        const dateKey = parseDateKey(c.start_date || c.created_at, c.name);
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
                        item.attemptedCount++;
                        if (['delivered', 'read', 'respondida', 'convertida', 'entregue', 'lida', 'recebida', 'interagiu', 'converted'].includes(st) || q.response_detected) {
                            item.deliveredCount++;
                        } else if (['failed', 'error', 'undelivered', 'not_delivered', 'rejected'].includes(st)) {
                            item.failedCount++;
                        }
                        if (['read', 'respondida', 'convertida', 'lida', 'recebida', 'interagiu', 'converted'].includes(st) || q.response_detected) {
                            item.readCount++;
                        }
                        if (q.response_detected || ['respondida', 'interagiu'].includes(st)) {
                            item.repliedCount++;
                        }
                    });
                }
            }

            // 2. Reengajamento: consultas paginadas de 1000 em 1000 na outbound_queue dentro da faixa de datas
            const reengRows: any[] = [];
            let reengPage = 0;
            const reengPageSize = 1000;
            let hasMoreReeng = true;

            while (hasMoreReeng) {
                let reengQuery = supabaseReader
                    .from('outbound_queue')
                    .select('reengagement_last_sent_at, status, response_detected')
                    .eq('tenant_id', tenantId)
                    .gt('reengagement_attempt_count', 0)
                    .gte('reengagement_last_sent_at', `${startStr}T00:00:00Z`)
                    .lte('reengagement_last_sent_at', `${endStr}T23:59:59Z`)
                    .order('reengagement_last_sent_at', { ascending: false })
                    .range(reengPage * reengPageSize, (reengPage + 1) * reengPageSize - 1);

                if (campaignId) {
                    reengQuery = reengQuery.eq('campaign_id', campaignId);
                }

                const { data: pageData, error: pageErr } = await reengQuery;
                if (pageErr || !pageData || pageData.length === 0) {
                    hasMoreReeng = false;
                } else {
                    reengRows.push(...pageData);
                    if (pageData.length < reengPageSize || reengRows.length >= 30000) {
                        hasMoreReeng = false;
                    } else {
                        reengPage++;
                    }
                }
            }

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
                const isDelivered = ['delivered', 'entregue', 'read', 'lida', 'recebida', 'respondida', 'interagiu', 'converted', 'convertida'].includes(st) || Boolean(r.response_detected);
                if (isDelivered) item.deliveredCount++;
                if (['read', 'lida', 'recebida', 'respondida', 'interagiu', 'converted', 'convertida'].includes(st) || Boolean(r.response_detected)) item.readCount++;
                if (['failed', 'error', 'undelivered', 'not_delivered', 'rejected'].includes(st)) item.failedCount++;
            });

            // 3. Aquecimento / Anti-Abandono de Funil (paginação de 1000 em 1000)
            const followupRows: any[] = [];
            let fupPage = 0;
            const fupPageSize = 1000;
            let hasMoreFup = true;

            while (hasMoreFup) {
                let followupQuery = supabaseReader
                    .from('outbound_queue')
                    .select('created_at, sent_at, status, response_detected, metadata')
                    .eq('tenant_id', tenantId)
                    .filter('metadata->>is_funnel_followup', 'eq', 'true')
                    .range(fupPage * fupPageSize, (fupPage + 1) * fupPageSize - 1);

                if (campaignId) {
                    followupQuery = followupQuery.eq('campaign_id', campaignId);
                }

                const { data: pageData, error: pageErr } = await followupQuery;
                if (pageErr || !pageData || pageData.length === 0) {
                    hasMoreFup = false;
                } else {
                    followupRows.push(...pageData);
                    if (pageData.length < fupPageSize || followupRows.length >= 20000) {
                        hasMoreFup = false;
                    } else {
                        fupPage++;
                    }
                }
            }

            (followupRows || []).forEach((r: any) => {
                const rawDate = r.metadata?.funnel_followup_last_sent_at || r.sent_at || r.created_at;
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
                const isDelivered = ['delivered', 'entregue', 'read', 'lida', 'recebida', 'respondida', 'interagiu', 'converted', 'convertida'].includes(st) || Boolean(r.response_detected);
                if (isDelivered) item.deliveredCount++;
                if (['read', 'lida', 'recebida', 'respondida', 'interagiu', 'converted', 'convertida'].includes(st) || Boolean(r.response_detected)) item.readCount++;
                if (['failed', 'error', 'undelivered', 'not_delivered', 'rejected'].includes(st)) item.failedCount++;
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

