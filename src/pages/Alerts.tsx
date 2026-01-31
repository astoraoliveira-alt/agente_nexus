import { Bell, AlertTriangle, AlertCircle, Info, Check, Trash2 } from 'lucide-react';
import { MainLayout } from '@/components/layout/MainLayout';
import { mockAlerts } from '@/lib/mock-data';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useState } from 'react';
import { cn } from '@/lib/utils';

export default function Alerts() {
  const [alerts, setAlerts] = useState(mockAlerts);

  const markAsRead = (id: string) => {
    setAlerts(prev => prev.map(a => a.id === id ? { ...a, read: true } : a));
  };

  const markAllAsRead = () => {
    setAlerts(prev => prev.map(a => ({ ...a, read: true })));
  };

  const unreadCount = alerts.filter(a => !a.read).length;

  const getAlertIcon = (type: string) => {
    switch (type) {
      case 'critical':
        return <AlertCircle className="h-5 w-5 text-destructive" />;
      case 'warning':
        return <AlertTriangle className="h-5 w-5 text-warning" />;
      default:
        return <Info className="h-5 w-5 text-info" />;
    }
  };

  return (
    <MainLayout>
      <div className="h-full overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-background border-b border-border">
          <div className="px-6 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-muted flex items-center justify-center">
                  <Bell className="h-5 w-5" />
                </div>
                <div>
                  <h1 className="text-2xl font-bold">Alertas</h1>
                  <p className="text-sm text-muted-foreground">
                    {unreadCount > 0 ? `${unreadCount} não lidos` : 'Todos lidos'}
                  </p>
                </div>
              </div>
              {unreadCount > 0 && (
                <Button variant="outline" size="sm" onClick={markAllAsRead}>
                  <Check className="h-4 w-4 mr-2" />
                  Marcar todos como lidos
                </Button>
              )}
            </div>
          </div>
        </div>

        <div className="p-6">
          {/* Alerts List */}
          <div className="space-y-2">
            {alerts.map((alert) => (
              <div
                key={alert.id}
                className={cn(
                  'kpi-card flex items-start gap-4 cursor-pointer transition-all',
                  !alert.read && 'border-l-4',
                  alert.type === 'critical' && !alert.read && 'border-l-destructive bg-destructive/5',
                  alert.type === 'warning' && !alert.read && 'border-l-warning bg-warning/5',
                  alert.type === 'info' && !alert.read && 'border-l-info bg-info/5',
                  alert.read && 'opacity-60'
                )}
                onClick={() => markAsRead(alert.id)}
              >
                <div className="flex-shrink-0 mt-0.5">
                  {getAlertIcon(alert.type)}
                </div>
                
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-medium">{alert.title}</h3>
                    {!alert.read && (
                      <Badge variant="secondary" className="text-xs">Novo</Badge>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground">{alert.message}</p>
                  <p className="text-xs text-muted-foreground mt-2">
                    {formatDistanceToNow(alert.timestamp, { addSuffix: true, locale: ptBR })}
                  </p>
                </div>

                <Button variant="ghost" size="icon" className="flex-shrink-0">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}

            {alerts.length === 0 && (
              <div className="text-center py-12">
                <Bell className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground">Nenhum alerta no momento</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </MainLayout>
  );
}
