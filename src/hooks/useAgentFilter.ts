import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { Contact } from '@/lib/types';

export function useAgentFilter(tenantId?: string) {
  const [agents, setAgents] = useState<{ id: string; name: string }[]>([]);
  const [selectedAgentId, setSelectedAgentId] = useState<string>('all');
  const [agentIdentifierSet, setAgentIdentifierSet] = useState<Set<string> | null>(null);
  const [isLoadingFilter, setIsLoadingFilter] = useState<boolean>(false);

  // 1. Carrega os agentes e define o default para o novo agente
  useEffect(() => {
    if (!tenantId) return;
    let isMounted = true;

    async function loadAgents() {
      try {
        const { data, error } = await supabase
          .from('agents')
          .select('id, name')
          .eq('tenant_id', tenantId)
          .order('name');

        if (!isMounted) return;
        if (data && data.length > 0) {
          setAgents(data);
          const newAgent = data.find(a =>
            a.name.toLowerCase().includes('(novo)') ||
            a.name.toLowerCase().includes('novo')
          ) || data.find(a =>
            a.name.toLowerCase().includes('fiserv') && a.name.toLowerCase().includes('comercial')
          ) || data.find(a =>
            a.name.toLowerCase().includes('fiserv')
          );

          if (newAgent) {
            setSelectedAgentId(newAgent.id);
          } else {
            setSelectedAgentId('all');
          }
        }
      } catch (err) {
        console.error('Erro ao carregar agentes para filtro:', err);
      }
    }

    loadAgents();
    return () => { isMounted = false; };
  }, [tenantId]);

  // 2. Quando selectedAgentId muda, se !== 'all', busca os identificadores associados ao agente
  useEffect(() => {
    if (!tenantId || selectedAgentId === 'all') {
      setAgentIdentifierSet(null);
      return;
    }

    let isMounted = true;
    setIsLoadingFilter(true);

    async function fetchIdentifiers() {
      try {
        const [convRes, leadsRes, queueRes] = await Promise.all([
          supabase.from('conversations').select('user_identifier').eq('agent_id', selectedAgentId).limit(5000),
          supabase.from('agent_leads').select('identifier, whatsapp').eq('agent_id', selectedAgentId).limit(5000),
          supabase.from('outbound_queue').select('contact_phone').eq('agent_id', selectedAgentId).limit(5000)
        ]);

        if (!isMounted) return;

        const normSet = new Set<string>();
        const addNormalized = (raw?: string | null) => {
          if (!raw) return;
          const digits = String(raw).replace(/\D/g, '');
          if (digits) {
            normSet.add(digits);
            if (digits.length >= 10) normSet.add(digits.slice(-10));
            if (digits.length >= 11) normSet.add(digits.slice(-11));
          }
        };

        convRes.data?.forEach(r => addNormalized(r.user_identifier));
        leadsRes.data?.forEach(r => {
          addNormalized(r.identifier);
          addNormalized(r.whatsapp);
        });
        queueRes.data?.forEach(r => addNormalized(r.contact_phone));

        setAgentIdentifierSet(normSet);
      } catch (err) {
        console.error('Erro ao buscar identificadores do agente:', err);
        setAgentIdentifierSet(new Set());
      } finally {
        if (isMounted) setIsLoadingFilter(false);
      }
    }

    fetchIdentifiers();
    return () => { isMounted = false; };
  }, [tenantId, selectedAgentId]);

  // 3. Função de filtro para contatos
  const filterContacts = useCallback((contactsList: Contact[]): Contact[] => {
    if (selectedAgentId === 'all' || !agentIdentifierSet) {
      return contactsList;
    }

    return contactsList.filter(c => {
      const idDigits = (c.identifier || '').replace(/\D/g, '');
      const phoneDigits = (c.phone || '').replace(/\D/g, '');

      return (
        (idDigits && (
          agentIdentifierSet.has(idDigits) ||
          agentIdentifierSet.has(idDigits.slice(-10)) ||
          agentIdentifierSet.has(idDigits.slice(-11))
        )) ||
        (phoneDigits && (
          agentIdentifierSet.has(phoneDigits) ||
          agentIdentifierSet.has(phoneDigits.slice(-10)) ||
          agentIdentifierSet.has(phoneDigits.slice(-11))
        ))
      );
    });
  }, [selectedAgentId, agentIdentifierSet]);

  return {
    agents,
    selectedAgentId,
    setSelectedAgentId,
    isLoadingFilter,
    filterContacts,
  };
}
