import { MessageSquare, BarChart3, Bell, Clock, Users, TrendingUp, Bot, Zap, Target, Layers } from 'lucide-react';
import { MainLayout } from '@/components/layout/MainLayout';
import { KPICard } from '@/components/dashboard/KPICard';
import { EdenredConversionBanner } from '@/components/dashboard/EdenredConversionBanner';
import { useApp } from '@/contexts/AppContext';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/services/api';
import { dashboardService } from '@/services/dashboard.service';
import { cn } from '@/lib/utils';
import { TooltipProvider } from "@/components/ui/tooltip";
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { ABPerformanceArena } from '@/components/dashboard/ABPerformanceArena';
import { CampaignExecutiveView } from '@/components/dashboard/CampaignExecutiveView';
import { CreditCampaignFunnelView } from '@/components/dashboard/CreditCampaignFunnelView';

const EDENRED_TENANT_ID = 'd290f1ee-6c54-4b01-90e6-d701748f0851';

export default function Index() {
  const { currentTenant, openSlideOver } = useApp();
  const navigate = useNavigate();

  const { data: dashData, isLoading } = useQuery({
    queryKey: ['dashboard-stats', currentTenant?.id],
    queryFn: () => api.getDashMaster(currentTenant!.id),
    enabled: !!currentTenant?.id,
    refetchInterval: 60000,
  });

  // Edenred-specific conversion query
  const isEdenred = currentTenant?.id === EDENRED_TENANT_ID;
  const { data: edenredFunnel, isLoading: isLoadingEdenred } = useQuery({
    queryKey: ['edenred-conversion', currentTenant?.id],
    queryFn: () => dashboardService.getEdenredConversionFunnel(currentTenant!.id),
    enabled: isEdenred,
    refetchInterval: 60000,
  });

  // Default structure to prevent Uncaught TypeError
  const defaultRoi = { minsPerMsg: 2, operatorHourRate: 30 };
  const summary = dashData?.summary || { 
    activeConversations: 0, 
    automationRate: 100, 
    avgTrustScore: 0, 
    totalEvaluations: 0,
    roiCriteria: defaultRoi 
  };
  
  // Extra layer of safety for cases where dashData exists but without roiCriteria
  const roiCriteria = summary.roiCriteria || defaultRoi;

  const usage = dashData?.usage || { totalMessages: 0 };
  const financials = dashData?.financials || { displaySavedTime: '0m', totalMoneySaved: 0 };
  const plan = dashData?.plan || { name: 'Flex', limits: { messages: 1000 } };
  const incidents = dashData?.incidents || { total: 0, open: 0, investigating: 0, resolved: 0 };
  const contacts = dashData?.contacts || { total: 0, hot: 0, warm: 0, cold: 0 };
  const agents = dashData?.agents || [];
  const dailyUsageData = dashData?.charts?.dailyMessages || [];

  const messageUsagePct = (usage.totalMessages / (plan.limits.messages || 1)) * 100;

  if (isLoading) {
    return (
      <MainLayout>
        <div className="p-8 max-w-[1600px] mx-auto space-y-8 animate-pulse text-background">.</div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="min-h-screen bg-[#F8FAFC] pb-20">
        <div className="p-4 lg:p-8 max-w-[1800px] mx-auto space-y-6">
          <Tabs defaultValue="credit-funnel" className="w-full space-y-6">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <TabsList className="bg-slate-200/70 p-1 rounded-xl">
                <TabsTrigger 
                  value="credit-funnel"
                  className="gap-2 px-4 py-2 text-xs font-bold data-[state=active]:bg-white data-[state=active]:text-slate-900 data-[state=active]:shadow-sm rounded-lg"
                >
                  <Target className="w-4 h-4 text-[#E5003A]" />
                  Funil Executivo de Crédito (Novo Agente)
                </TabsTrigger>
                <TabsTrigger 
                  value="campaign-overview"
                  className="gap-2 px-4 py-2 text-xs font-bold data-[state=active]:bg-white data-[state=active]:text-slate-900 data-[state=active]:shadow-sm rounded-lg"
                >
                  <Layers className="w-4 h-4 text-slate-500" />
                  Painel Geral de Disparos
                </TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="credit-funnel" className="mt-0 focus-visible:outline-none">
              <CreditCampaignFunnelView />
            </TabsContent>

            <TabsContent value="campaign-overview" className="mt-0 focus-visible:outline-none">
              <CampaignExecutiveView />
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </MainLayout>
  );
}

