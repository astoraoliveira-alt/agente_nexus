import { Layers, RotateCcw, CalendarDays, RefreshCw, Target } from 'lucide-react';
import { MainLayout } from '@/components/layout/MainLayout';
import { useQueryClient } from '@tanstack/react-query';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { useState } from 'react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { CampaignExecutiveView } from '@/components/dashboard/CampaignExecutiveView';
import { CreditCampaignFunnelView } from '@/components/dashboard/CreditCampaignFunnelView';
import { ReengagementComparisonView } from '@/components/dashboard/ReengagementComparisonView';
import { DailyFunnelStatusView } from '@/components/dashboard/DailyFunnelStatusView';

export default function Index() {
  const queryClient = useQueryClient();

  const [refreshKey, setRefreshKey] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const [activeCampaignId, setActiveCampaignId] = useState<string | null>(() => {
    return sessionStorage.getItem('davos_active_campaign_id') || null;
  });

  const handleSelectCampaign = (campId: string) => {
    setActiveCampaignId(campId);
    sessionStorage.setItem('davos_active_campaign_id', campId);
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    setRefreshKey(prev => prev + 1);
    await Promise.allSettled([
      queryClient.invalidateQueries()
    ]);
    setTimeout(() => {
      setIsRefreshing(false);
    }, 400);
  };

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
                  Funil Executivo de Crédito
                </TabsTrigger>
                <TabsTrigger 
                  value="campaign-overview"
                  className="gap-2 px-4 py-2 text-xs font-bold data-[state=active]:bg-white data-[state=active]:text-slate-900 data-[state=active]:shadow-sm rounded-lg"
                >
                  <Layers className="w-4 h-4 text-slate-500" />
                  Painel Geral de Disparos
                </TabsTrigger>
                <TabsTrigger 
                  value="daily-status"
                  className="gap-2 px-4 py-2 text-xs font-bold data-[state=active]:bg-white data-[state=active]:text-slate-900 data-[state=active]:shadow-sm rounded-lg"
                >
                  <CalendarDays className="w-4 h-4 text-emerald-600" />
                  Status & Performance Diária
                </TabsTrigger>
                <TabsTrigger 
                  value="reengagement-comparison"
                  className="gap-2 px-4 py-2 text-xs font-bold data-[state=active]:bg-white data-[state=active]:text-slate-900 data-[state=active]:shadow-sm rounded-lg"
                >
                  <RotateCcw className="w-4 h-4 text-blue-600" />
                  Comparativo de Reengajamento
                </TabsTrigger>
              </TabsList>

              <Button
                variant="outline"
                size="icon"
                onClick={handleRefresh}
                disabled={isRefreshing}
                title="Atualizar dados do dashboard"
                className="h-9 w-9 bg-white hover:bg-slate-100 border-slate-200 text-slate-700 shadow-sm transition-all rounded-xl"
              >
                <RefreshCw className={cn("w-4 h-4 text-slate-600", isRefreshing && "animate-spin text-emerald-600")} />
              </Button>
            </div>

            <TabsContent value="credit-funnel" className="mt-0 focus-visible:outline-none">
              <CreditCampaignFunnelView key={refreshKey} onSelectCampaign={handleSelectCampaign} />
            </TabsContent>

            <TabsContent value="daily-status" className="mt-0 focus-visible:outline-none">
              <DailyFunnelStatusView key={refreshKey} />
            </TabsContent>

            <TabsContent value="campaign-overview" className="mt-0 focus-visible:outline-none">
              <CampaignExecutiveView key={refreshKey} onSelectCampaign={handleSelectCampaign} />
            </TabsContent>

            <TabsContent value="reengagement-comparison" className="mt-0 focus-visible:outline-none">
              <ReengagementComparisonView 
                key={refreshKey}
                initialCampaignId={activeCampaignId || undefined}
                onSelectCampaign={handleSelectCampaign}
              />
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </MainLayout>
  );
}

