export type HomeKpi = {
  id: string;
  label: string;
  value: string;
  delta: string;
  context: string;
  tone: 'neutral' | 'positive' | 'warning';
};

export type HomeInitiative = {
  id: string;
  name: string;
  owner: string;
  quarter: string;
  progress: number;
  status: 'On Track' | 'At Risk' | 'Needs Review';
  summary: string;
  milestone: string;
};

export type HomeShortcut = {
  id: string;
  title: string;
  description: string;
  href: string;
  badge: string;
};

export type HomeActivity = {
  id: string;
  actor: string;
  team: string;
  action: string;
  detail: string;
  timestamp: string;
};

export type HomeRevenuePoint = {
  period: string;
  revenue: number;
  target: number;
};

export type HomeOkr = {
  id: string;
  objective: string;
  progress: number;
  keyResult: string;
};

export type HomeRoadmapItem = {
  id: string;
  phase: string;
  title: string;
  eta: string;
  owner: string;
};

export type ProductHomePayload = {
  hero: {
    title: string;
    subtitle: string;
    periodLabel: string;
  };
  kpis: HomeKpi[];
  initiatives: HomeInitiative[];
  shortcuts: HomeShortcut[];
  activityFeed: HomeActivity[];
  revenueTrend: HomeRevenuePoint[];
  okrs: HomeOkr[];
  roadmap: HomeRoadmapItem[];
};

const mockProductHomePayload: ProductHomePayload = {
  hero: {
    title: 'Product Operations Overview',
    subtitle: 'Track delivery health, revenue impact, and cross-team execution from one business-ready dashboard.',
    periodLabel: 'Updated in the last 15 minutes',
  },
  kpis: [
    {
      id: 'kpi-arr',
      label: 'Monthly Recurring Revenue',
      value: '$842k',
      delta: '+8.4%',
      context: 'vs. previous month',
      tone: 'positive',
    },
    {
      id: 'kpi-nrr',
      label: 'Net Revenue Retention',
      value: '112%',
      delta: '+3 pts',
      context: 'expansion-led growth',
      tone: 'positive',
    },
    {
      id: 'kpi-cycle',
      label: 'Release Cycle Time',
      value: '12 days',
      delta: '-18%',
      context: 'from spec to production',
      tone: 'positive',
    },
    {
      id: 'kpi-risk',
      label: 'Open Delivery Risks',
      value: '6',
      delta: '+2',
      context: 'requires weekly review',
      tone: 'warning',
    },
  ],
  initiatives: [
    {
      id: 'init-1',
      name: 'Self-Serve Onboarding',
      owner: 'Growth Product',
      quarter: 'Q2',
      progress: 78,
      status: 'On Track',
      summary: 'Driving activation uplift with guided setup, in-product milestones, and lifecycle comms.',
      milestone: 'Milestone: pilot launch with 12 design partners',
    },
    {
      id: 'init-2',
      name: 'Enterprise Governance Controls',
      owner: 'Platform',
      quarter: 'Q2',
      progress: 52,
      status: 'Needs Review',
      summary: 'Consolidates auditability, permissions, and approval workflows across tenant operations.',
      milestone: 'Milestone: policy editor blocked by schema migration',
    },
    {
      id: 'init-3',
      name: 'Expansion Revenue Dashboard',
      owner: 'Commercial Ops',
      quarter: 'Q3',
      progress: 64,
      status: 'At Risk',
      summary: 'Surfaces upsell signals, account health, and renewal blockers for customer teams.',
      milestone: 'Milestone: finance data connector under validation',
    },
  ],
  shortcuts: [
    {
      id: 'shortcut-backlog',
      title: 'Backlog Board',
      description: 'Review sprint priorities, blocked stories, and upcoming releases.',
      href: '/lead-crm',
      badge: 'Execution',
    },
    {
      id: 'shortcut-analytics',
      title: 'Analytics Dashboards',
      description: 'Open KPI tracking, retention cohorts, and business performance panels.',
      href: '/consumption',
      badge: 'Insights',
    },
    {
      id: 'shortcut-feedback',
      title: 'Customer Feedback Loop',
      description: 'Inspect product feedback, operational friction, and escalations.',
      href: '/conversations',
      badge: 'Voice of Customer',
    },
  ],
  activityFeed: [
    {
      id: 'activity-1',
      actor: 'Ana Rodrigues',
      team: 'Product',
      action: 'updated initiative scope',
      detail: 'Added approval workflow acceptance criteria to Governance Controls.',
      timestamp: '12 min ago',
    },
    {
      id: 'activity-2',
      actor: 'Pedro Santos',
      team: 'Engineering',
      action: 'moved release to QA',
      detail: 'Self-Serve Onboarding release candidate is now in validation.',
      timestamp: '46 min ago',
    },
    {
      id: 'activity-3',
      actor: 'Marina Costa',
      team: 'Customer Success',
      action: 'flagged feedback trend',
      detail: 'Three strategic accounts requested deeper permissions visibility.',
      timestamp: '1h ago',
    },
    {
      id: 'activity-4',
      actor: 'Carlos Silva',
      team: 'Revenue Ops',
      action: 'confirmed forecast uplift',
      detail: 'Expansion dashboard pilot points to +$52k in pipeline influenced.',
      timestamp: '2h ago',
    },
  ],
  revenueTrend: [
    { period: 'Jan', revenue: 640, target: 620 },
    { period: 'Feb', revenue: 675, target: 650 },
    { period: 'Mar', revenue: 712, target: 690 },
    { period: 'Apr', revenue: 758, target: 725 },
    { period: 'May', revenue: 801, target: 770 },
    { period: 'Jun', revenue: 842, target: 815 },
  ],
  okrs: [
    {
      id: 'okr-1',
      objective: 'Improve activation speed for new product teams',
      progress: 74,
      keyResult: 'KR1: reduce time-to-first-value from 9.2 to 6.5 days',
    },
    {
      id: 'okr-2',
      objective: 'Raise governance confidence for enterprise accounts',
      progress: 58,
      keyResult: 'KR2: reach 90% admin task completion without support intervention',
    },
    {
      id: 'okr-3',
      objective: 'Increase expansion-ready account coverage',
      progress: 67,
      keyResult: 'KR3: classify 85% of renewals with product adoption signals',
    },
  ],
  roadmap: [
    {
      id: 'roadmap-1',
      phase: 'Now',
      title: 'Approval workflow hardening',
      eta: 'This week',
      owner: 'Platform',
    },
    {
      id: 'roadmap-2',
      phase: 'Next',
      title: 'Product analytics instrumentation',
      eta: '2 weeks',
      owner: 'Data',
    },
    {
      id: 'roadmap-3',
      phase: 'Later',
      title: 'Revenue health forecasting',
      eta: 'Q3',
      owner: 'Commercial Ops',
    },
  ],
};

export const homeService = {
  async getProductHomeDashboard(): Promise<ProductHomePayload> {
    return Promise.resolve(mockProductHomePayload);
  },
};

