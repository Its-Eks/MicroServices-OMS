import { DatabaseService } from './database.service.js';

export interface OnboardingAnalytics {
  overview: OnboardingOverviewMetrics;
  conversion: TrialConversionMetrics;
  performance: OnboardingPerformanceMetrics;
  insights: OnboardingInsightsMetrics;
  trends: OnboardingTrendMetrics;
}

export interface OnboardingOverviewMetrics {
  totalOnboardings: number;
  activeOnboardings: number;
  completedOnboardings: number;
  trialCustomers: number;
  conversionRate: number;
  averageCompletionTime: number;
  completionRate: number;
  stuckOnboardings: number;
  expiringTrials: number;
}

export interface TrialConversionMetrics {
  totalTrials: number;
  convertedTrials: number;
  conversionRate: number;
  averageConversionTime: number;
  conversionByCampaign: Array<{
    campaign: string;
    rate: number;
    count: number;
  }>;
  conversionTrend: Array<{
    date: string;
    rate: number;
    count: number;
  }>;
  expiringTrials: Array<{
    id: string;
    customerName: string;
    daysRemaining: number;
    engagement: number;
  }>;
}

export interface OnboardingPerformanceMetrics {
  completionRate: number;
  averageCompletionTime: number;
  completionByType: Array<{
    type: string;
    rate: number;
    avgTime: number;
    count: number;
  }>;
  stepCompletionTimes: Array<{
    step: string;
    avgTime: number;
    count: number;
  }>;
  bottleneckSteps: Array<{
    step: string;
    avgTime: number;
    stuckCount: number;
  }>;
}

export interface OnboardingInsightsMetrics {
  topInsights: Array<{
    id: string;
    title: string;
    description: string;
    impact: 'high' | 'medium' | 'low';
    category: string;
    confidence: number;
    actionable: boolean;
    recommendations: string[];
  }>;
  anomalies: Array<{
    id: string;
    type: string;
    description: string;
    severity: 'critical' | 'warning' | 'info';
    detectedAt: string;
    impact: string;
    recommendedAction: string;
  }>;
  opportunities: Array<{
    id: string;
    title: string;
    description: string;
    potentialImpact: string;
    effort: 'low' | 'medium' | 'high';
    priority: number;
    timeline: string;
  }>;
}

export interface OnboardingTrendMetrics {
  completionTrend: Array<{
    date: string;
    rate: number;
    avgTime: number;
    count: number;
  }>;
  volumeTrend: Array<{
    date: string;
    volume: number;
    growth: number;
  }>;
  stepTrends: Array<{
    step: string;
    trend: Array<{
      date: string;
      avgTime: number;
      count: number;
    }>;
  }>;
}

export interface OnboardingFilters {
  dateRange?: {
    start: string;
    end: string;
  };
  onboardingTypes?: string[];
  customerTypes?: string[];
  assignedUsers?: string[];
  steps?: string[];
  granularity?: 'hour' | 'day' | 'week' | 'month' | 'quarter' | 'year';
}

export class OnboardingAnalyticsService {
  private db: DatabaseService;

  constructor(db: DatabaseService) {
    this.db = db;
  }

  async getOnboardingAnalytics(filters?: OnboardingFilters): Promise<OnboardingAnalytics> {
    try {
      const [overview, conversion, performance, insights, trends] = await Promise.all([
        this.getOverviewMetrics(filters),
        this.getTrialConversionMetrics(filters),
        this.getPerformanceMetrics(filters),
        this.getInsightsMetrics(filters),
        this.getTrendMetrics(filters)
      ]);

      return {
        overview,
        conversion,
        performance,
        insights,
        trends
      };
    } catch (error) {
      console.error('Error getting onboarding analytics:', error);
      throw error;
    }
  }

  private async getOverviewMetrics(filters?: OnboardingFilters): Promise<OnboardingOverviewMetrics> {
    const dateFilter = this.buildDateFilter(filters?.dateRange);
    
    const [
      totalResult,
      activeResult,
      completedResult,
      trialResult,
      conversionResult,
      avgTimeResult,
      stuckResult,
      expiringResult
    ] = await Promise.all([
      this.db.query(`
        SELECT COUNT(*)::int as count 
        FROM onboarding_instances 
        ${dateFilter}
      `),
      this.db.query(`
        SELECT COUNT(*)::int as count 
        FROM onboarding_instances 
        WHERE current_step != 'completed' 
        ${dateFilter}
      `),
      this.db.query(`
        SELECT COUNT(*)::int as count 
        FROM onboarding_instances 
        WHERE current_step = 'completed' 
        ${dateFilter}
      `),
      this.db.query(`
        SELECT COUNT(*)::int as count 
        FROM customers 
        WHERE is_trial = true
      `),
      this.db.query(`
        SELECT 
          COUNT(*)::int as total,
          COUNT(CASE WHEN trial_end_date IS NOT NULL AND trial_end_date < NOW() THEN 1 END)::int as converted
        FROM customers 
        WHERE is_trial = true
      `),
      this.db.query(`
        SELECT AVG(EXTRACT(EPOCH FROM (updated_at - created_at))/86400) as avg_days
        FROM onboarding_instances 
        WHERE current_step = 'completed' 
        ${dateFilter}
      `),
      this.db.query(`
        SELECT COUNT(*)::int as count
        FROM onboarding_instances 
        WHERE current_step != 'completed' 
        AND updated_at < NOW() - INTERVAL '7 days'
        ${dateFilter}
      `),
      this.db.query(`
        SELECT COUNT(*)::int as count
        FROM customers 
        WHERE is_trial = true 
        AND trial_end_date BETWEEN NOW() AND NOW() + INTERVAL '7 days'
      `)
    ]);

    const total = totalResult.rows[0]?.count || 0;
    const completed = completedResult.rows[0]?.count || 0;
    const conversionData = conversionResult.rows[0];
    const totalTrials = conversionData?.total || 0;
    const converted = conversionData?.converted || 0;
    const conversionRate = totalTrials > 0 ? (converted / totalTrials) * 100 : 0;
    const completionRate = total > 0 ? (completed / total) * 100 : 0;

    return {
      totalOnboardings: total,
      activeOnboardings: activeResult.rows[0]?.count || 0,
      completedOnboardings: completed,
      trialCustomers: trialResult.rows[0]?.count || 0,
      conversionRate: Math.round(conversionRate * 100) / 100,
      averageCompletionTime: Math.round((avgTimeResult.rows[0]?.avg_days || 0) * 100) / 100,
      completionRate: Math.round(completionRate * 100) / 100,
      stuckOnboardings: stuckResult.rows[0]?.count || 0,
      expiringTrials: expiringResult.rows[0]?.count || 0
    };
  }

  private async getTrialConversionMetrics(filters?: OnboardingFilters): Promise<TrialConversionMetrics> {
    const dateFilter = this.buildDateFilter(filters?.dateRange);
    
    const [trialResult, conversionTrend] = await Promise.all([
      this.db.query(`
        SELECT 
          COUNT(*)::int as total,
          COUNT(CASE WHEN trial_end_date IS NOT NULL AND trial_end_date < NOW() THEN 1 END)::int as converted,
          AVG(CASE 
            WHEN trial_end_date IS NOT NULL AND trial_end_date < NOW() 
            THEN EXTRACT(EPOCH FROM (trial_end_date - trial_start_date))/86400 
          END) as avg_conversion_time
        FROM customers 
        WHERE is_trial = true
      `),
      this.db.query(`
        SELECT 
          DATE_TRUNC('day', trial_start_date) as date,
          COUNT(*)::int as total,
          COUNT(CASE WHEN trial_end_date IS NOT NULL AND trial_end_date < NOW() THEN 1 END)::int as converted
        FROM customers 
        WHERE is_trial = true 
        AND trial_start_date >= NOW() - INTERVAL '30 days'
        GROUP BY DATE_TRUNC('day', trial_start_date)
        ORDER BY date DESC
      `)
    ]);

    const data = trialResult.rows[0];
    const total = data?.total || 0;
    const converted = data?.converted || 0;
    const conversionRate = total > 0 ? (converted / total) * 100 : 0;

    const expiringTrials = await this.getExpiringTrials();

    return {
      totalTrials: total,
      convertedTrials: converted,
      conversionRate: Math.round(conversionRate * 100) / 100,
      averageConversionTime: Math.round((data?.avg_conversion_time || 0) * 100) / 100,
      conversionByCampaign: [], // Would be populated with campaign data
      conversionTrend: conversionTrend.rows.map(row => ({
        date: row.date.toISOString().split('T')[0],
        rate: row.total > 0 ? Math.round((row.converted / row.total) * 10000) / 100 : 0,
        count: row.total
      })),
      expiringTrials
    };
  }

  private async getPerformanceMetrics(filters?: OnboardingFilters): Promise<OnboardingPerformanceMetrics> {
    const dateFilter = this.buildDateFilter(filters?.dateRange);
    
    const [completionByType, stepTimes, bottleneckSteps] = await Promise.all([
      this.db.query(`
        SELECT 
          onboarding_type,
          COUNT(*)::int as total,
          COUNT(CASE WHEN current_step = 'completed' THEN 1 END)::int as completed,
          AVG(CASE 
            WHEN current_step = 'completed' 
            THEN EXTRACT(EPOCH FROM (updated_at - created_at))/86400 
          END) as avg_time
        FROM onboarding_instances 
        ${dateFilter}
        GROUP BY onboarding_type
      `),
      this.db.query(`
        SELECT 
          current_step,
          COUNT(*)::int as count,
          AVG(EXTRACT(EPOCH FROM (updated_at - created_at))/86400) as avg_time
        FROM onboarding_instances 
        WHERE current_step != 'initiated'
        ${dateFilter}
        GROUP BY current_step
        ORDER BY avg_time DESC
      `),
      this.db.query(`
        SELECT 
          current_step,
          AVG(EXTRACT(EPOCH FROM (updated_at - created_at))/86400) as avg_time,
          COUNT(*)::int as stuck_count
        FROM onboarding_instances 
        WHERE current_step != 'completed' 
        AND updated_at < NOW() - INTERVAL '3 days'
        ${dateFilter}
        GROUP BY current_step
        HAVING AVG(EXTRACT(EPOCH FROM (updated_at - created_at))/86400) > 2
        ORDER BY avg_time DESC
        LIMIT 5
      `)
    ]);

    const totalResult = await this.db.query(`
      SELECT COUNT(*)::int as total,
             COUNT(CASE WHEN current_step = 'completed' THEN 1 END)::int as completed
      FROM onboarding_instances 
      ${dateFilter}
    `);
    
    const total = totalResult.rows[0]?.total || 0;
    const completed = totalResult.rows[0]?.completed || 0;
    const completionRate = total > 0 ? (completed / total) * 100 : 0;

    return {
      completionRate: Math.round(completionRate * 100) / 100,
      averageCompletionTime: 0, // Would be calculated from completed onboardings
      completionByType: completionByType.rows.map(row => ({
        type: row.onboarding_type || 'unknown',
        rate: row.total > 0 ? Math.round((row.completed / row.total) * 10000) / 100 : 0,
        avgTime: Math.round((row.avg_time || 0) * 100) / 100,
        count: row.total
      })),
      stepCompletionTimes: stepTimes.rows.map(row => ({
        step: row.current_step,
        avgTime: Math.round((row.avg_time || 0) * 100) / 100,
        count: row.count
      })),
      bottleneckSteps: bottleneckSteps.rows.map(row => ({
        step: row.current_step,
        avgTime: Math.round((row.avg_time || 0) * 100) / 100,
        stuckCount: row.stuck_count
      }))
    };
  }

  private async getInsightsMetrics(filters?: OnboardingFilters): Promise<OnboardingInsightsMetrics> {
    // Generate insights based on current data
    const insights = await this.generateInsights();
    const anomalies = await this.detectAnomalies();
    const opportunities = await this.identifyOpportunities();

    return {
      topInsights: insights,
      anomalies,
      opportunities
    };
  }

  private async getTrendMetrics(filters?: OnboardingFilters): Promise<OnboardingTrendMetrics> {
    const dateFilter = this.buildDateFilter(filters?.dateRange);
    
    const [completionTrend, volumeTrend] = await Promise.all([
      this.db.query(`
        SELECT 
          DATE_TRUNC('day', created_at) as date,
          COUNT(*)::int as total,
          COUNT(CASE WHEN current_step = 'completed' THEN 1 END)::int as completed,
          AVG(CASE 
            WHEN current_step = 'completed' 
            THEN EXTRACT(EPOCH FROM (updated_at - created_at))/86400 
          END) as avg_time
        FROM onboarding_instances 
        WHERE created_at >= NOW() - INTERVAL '30 days'
        GROUP BY DATE_TRUNC('day', created_at)
        ORDER BY date DESC
      `),
      this.db.query(`
        SELECT 
          DATE_TRUNC('day', created_at) as date,
          COUNT(*)::int as volume
        FROM onboarding_instances 
        WHERE created_at >= NOW() - INTERVAL '30 days'
        GROUP BY DATE_TRUNC('day', created_at)
        ORDER BY date DESC
      `)
    ]);

    return {
      completionTrend: completionTrend.rows.map((row, index) => ({
        date: row.date.toISOString().split('T')[0],
        rate: row.total > 0 ? Math.round((row.completed / row.total) * 10000) / 100 : 0,
        avgTime: Math.round((row.avg_time || 0) * 100) / 100,
        count: row.total
      })),
      volumeTrend: volumeTrend.rows.map((row, index) => ({
        date: row.date.toISOString().split('T')[0],
        volume: row.volume,
        growth: index < volumeTrend.rows.length - 1 
          ? Math.round(((row.volume - volumeTrend.rows[index + 1].volume) / volumeTrend.rows[index + 1].volume) * 10000) / 100
          : 0
      })),
      stepTrends: [] // Would be populated with detailed step trends
    };
  }

  private async getExpiringTrials(): Promise<Array<{
    id: string;
    customerName: string;
    daysRemaining: number;
    engagement: number;
  }>> {
    const result = await this.db.query(`
      SELECT 
        c.id,
        CONCAT(c.first_name, ' ', c.last_name) as customer_name,
        EXTRACT(EPOCH FROM (c.trial_end_date - NOW()))/86400 as days_remaining,
        0 as engagement -- Would be calculated from actual engagement data
      FROM customers c
      WHERE c.is_trial = true 
      AND c.trial_end_date BETWEEN NOW() AND NOW() + INTERVAL '7 days'
      ORDER BY c.trial_end_date ASC
    `);

    return result.rows.map(row => ({
      id: row.id,
      customerName: row.customer_name || 'Unknown',
      daysRemaining: Math.ceil(row.days_remaining || 0),
      engagement: row.engagement
    }));
  }

  private async generateInsights(): Promise<Array<{
    id: string;
    title: string;
    description: string;
    impact: 'high' | 'medium' | 'low';
    category: string;
    confidence: number;
    actionable: boolean;
    recommendations: string[];
  }>> {
    // Generate insights based on current data patterns
    const insights = [];

    // Check completion rate
    const completionResult = await this.db.query(`
      SELECT 
        COUNT(*)::int as total,
        COUNT(CASE WHEN current_step = 'completed' THEN 1 END)::int as completed
      FROM onboarding_instances 
      WHERE created_at >= NOW() - INTERVAL '30 days'
    `);
    
    const total = completionResult.rows[0]?.total || 0;
    const completed = completionResult.rows[0]?.completed || 0;
    const completionRate = total > 0 ? (completed / total) * 100 : 0;

    if (completionRate > 90) {
      insights.push({
        id: 'high-completion-rate',
        title: 'Excellent Onboarding Completion Rate',
        description: `Your onboarding completion rate is ${completionRate.toFixed(1)}%, which exceeds the target of 95%.`,
        impact: 'high',
        category: 'performance',
        confidence: 0.95,
        actionable: false,
        recommendations: ['Continue current processes', 'Share best practices with team']
      });
    } else if (completionRate < 80) {
      insights.push({
        id: 'low-completion-rate',
        title: 'Onboarding Completion Rate Needs Improvement',
        description: `Your onboarding completion rate is ${completionRate.toFixed(1)}%, which is below the target of 95%.`,
        impact: 'high',
        category: 'performance',
        confidence: 0.90,
        actionable: true,
        recommendations: [
          'Review stuck onboardings and identify bottlenecks',
          'Implement automated follow-up reminders',
          'Provide additional support for customers in early stages'
        ]
      });
    }

    return insights;
  }

  private async detectAnomalies(): Promise<Array<{
    id: string;
    type: string;
    description: string;
    severity: 'critical' | 'warning' | 'info';
    detectedAt: string;
    impact: string;
    recommendedAction: string;
  }>> {
    const anomalies = [];

    // Check for stuck onboardings
    const stuckResult = await this.db.query(`
      SELECT COUNT(*)::int as count
      FROM onboarding_instances 
      WHERE current_step != 'completed' 
      AND updated_at < NOW() - INTERVAL '7 days'
    `);

    const stuckCount = stuckResult.rows[0]?.count || 0;
    if (stuckCount > 10) {
      anomalies.push({
        id: 'high-stuck-onboardings',
        type: 'stuck_onboardings',
        description: `${stuckCount} onboardings have been stuck for more than 7 days`,
        severity: 'warning',
        detectedAt: new Date().toISOString(),
        impact: 'Customer satisfaction and conversion rates may be affected',
        recommendedAction: 'Review stuck onboardings and implement proactive outreach'
      });
    }

    return anomalies;
  }

  private async identifyOpportunities(): Promise<Array<{
    id: string;
    title: string;
    description: string;
    potentialImpact: string;
    effort: 'low' | 'medium' | 'high';
    priority: number;
    timeline: string;
  }>> {
    const opportunities = [];

    // Check trial conversion opportunities
    const trialResult = await this.db.query(`
      SELECT COUNT(*)::int as count
      FROM customers 
      WHERE is_trial = true 
      AND trial_end_date BETWEEN NOW() AND NOW() + INTERVAL '3 days'
    `);

    const expiringCount = trialResult.rows[0]?.count || 0;
    if (expiringCount > 0) {
      opportunities.push({
        id: 'trial-conversion-opportunity',
        title: 'Trial Conversion Opportunity',
        description: `${expiringCount} trials are expiring in the next 3 days`,
        potentialImpact: 'High conversion potential with immediate action',
        effort: 'low',
        priority: 1,
        timeline: 'Immediate'
      });
    }

    return opportunities;
  }

  private buildDateFilter(dateRange?: { start: string; end: string }): string {
    if (!dateRange) {
      return '';
    }
    return `WHERE created_at >= '${dateRange.start}' AND created_at <= '${dateRange.end}'`;
  }
}
