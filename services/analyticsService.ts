// Type definitions
interface AnalyticsData {
  activeUsers: number;
  topKeywords: string[];
  recentHighTrafficPages: string[];
  demographics: {
    primary: string;
    interest: string;
  };
}

import { getDailyReport, saveDailyReport } from './firestoreService';

export const getRealAnalyticsData = async (): Promise<AnalyticsData> => {
  try {
    // 1. Check Cache (Firestore)
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const cached = await getDailyReport(today);

    if (cached) {
      console.log(`[Analytics] Using cached data for ${today}`);
      return cached as AnalyticsData;
    }

    // 2. Fetch from API
    console.log(`[Analytics] Fetching fresh data from GA4 for ${today}...`);
    const response = await fetch('/api/analytics');

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Analytics API failed');
    }

    const report = await response.json();
    const rows = report.rows || [];

    const totalUsers = rows.reduce((acc: number, row: any) => acc + parseInt(row.metricValues[0].value || '0', 10), 0);
    const highTrafficPages = rows.slice(0, 5).map((row: any) => {
      return `${row.dimensionValues[1].value} (${row.dimensionValues[0].value})`;
    });
    const topKeywords = rows.slice(0, 5).map((row: any) => row.dimensionValues[1].value);

    const result: AnalyticsData = {
      activeUsers: totalUsers,
      topKeywords: topKeywords,
      recentHighTrafficPages: highTrafficPages,
      demographics: {
        primary: "30代〜40代 女性 (推定)",
        interest: "時短・簡単, 健康志向 (推定)"
      }
    };

    // 3. Save to Cache
    await saveDailyReport(today, result);
    console.log(`[Analytics] Saved new report to cache.`);

    return result;

  } catch (error) {
    console.error("Failed to fetch real GA4 data:", error);
    throw new Error(`GA4データ取得失敗: ${error instanceof Error ? error.message : String(error)}`);
  }
};