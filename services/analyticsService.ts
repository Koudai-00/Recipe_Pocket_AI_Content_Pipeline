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

export const getRealAnalyticsData = async (): Promise<AnalyticsData> => {
  try {
    // Call the backend endpoint instead of Google APIs directly
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

    return {
      activeUsers: totalUsers, 
      topKeywords: topKeywords,
      recentHighTrafficPages: highTrafficPages,
      demographics: {
        primary: "30代〜40代 女性 (推定)",
        interest: "時短・簡単, 健康志向 (推定)"
      }
    };
  } catch (error) {
    console.error("Failed to fetch real GA4 data:", error);
    throw new Error(`GA4データ取得失敗: ${error instanceof Error ? error.message : String(error)}`);
  }
};