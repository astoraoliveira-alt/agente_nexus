import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ResponsiveContainer, LineChart, CartesianGrid, XAxis, YAxis, Tooltip, Line } from 'recharts';
import { HomeRevenuePoint } from '@/services/home.service';

export function RevenueTrendCard({ points }: { points: HomeRevenuePoint[] }) {
  return (
    <Card className="border-slate-200 bg-white shadow-sm">
      <CardHeader className="space-y-1">
        <CardTitle className="text-lg text-slate-950">Revenue Performance</CardTitle>
        <p className="text-sm text-slate-500">Monthly recurring revenue vs. target</p>
      </CardHeader>
      <CardContent>
        <div className="h-[240px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={points} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
              <CartesianGrid stroke="#E2E8F0" vertical={false} strokeDasharray="4 4" />
              <XAxis dataKey="period" axisLine={false} tickLine={false} tick={{ fill: '#64748B', fontSize: 12 }} />
              <YAxis axisLine={false} tickLine={false} tick={{ fill: '#64748B', fontSize: 12 }} />
              <Tooltip
                contentStyle={{
                  borderRadius: '16px',
                  border: '1px solid #E2E8F0',
                  boxShadow: '0 12px 24px rgba(15, 23, 42, 0.08)',
                }}
              />
              <Line type="monotone" dataKey="target" stroke="#94A3B8" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="revenue" stroke="#0F172A" strokeWidth={3} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

