
export enum AgentType {
  IDLE = 'IDLE',
  ANALYST = 'ANALYST',
  MARKETER = 'MARKETER',
  WRITER = 'WRITER',
  DESIGNER = 'DESIGNER',
  CONTROLLER = 'CONTROLLER',
  PUBLISHER = 'PUBLISHER',
  COMPLETED = 'COMPLETED',
  ERROR = 'ERROR'
}

export interface LogEntry {
  id: string;
  timestamp: string;
  agent: AgentType;
  message: string;
  level: 'info' | 'success' | 'warning' | 'error';
}

export interface AnalysisResult {
  direction: string;
  topic: string;
}

export interface StrategyResult {
  concept: string;
  function_intro: string;
  title: string;
  structure: string[];
}

export interface DesignPrompts {
  thumbnail_prompt: string;
  section1_prompt: string;
  section2_prompt: string;
  section3_prompt: string;
  // Generated Image Data (Base64 strings - Temporary during generation)
  thumbnail_base64?: string;
  section1_base64?: string;
  section2_base64?: string;
  section3_base64?: string;
}

export interface ReviewResult {
  status: 'APPROVED' | 'REVIEW_REQUIRED';
  score: number;
  comments: string;
}

// Updated to match Firestore Schema Requirements
export interface ArticleContent {
  title: string;
  body_p1: string;
  body_p2: string;
  body_p3: string;
}

export interface Article {
  id: string; // Firestore Document ID
  date: string; // Timestamp
  status: 'Drafting' | 'Reviewing' | 'Approved' | 'Posted' | 'Rejected' | 'Error';

  // Reports
  analysis_report: AnalysisResult;
  marketing_strategy: StrategyResult;

  // Content Structure
  content: ArticleContent;

  // Images (Public URLs stored in Storage)
  image_urls: string[]; // [thumb, img1, img2, img3]

  review?: ReviewResult;

  // Internal/Transient (for UI display before upload)
  design?: DesignPrompts;

  // Legacy/Helper fields for UI compatibility
  title?: string;
  topic?: string;
  isImageGenSkipped?: boolean;
}

export interface PipelineState {
  status: AgentType;
  currentArticleId: string | null;
  progress: number;
}

export interface SupabaseConfig {
  url: string;
  anonKey: string;
  authorId: string;
  autoPost: boolean;
}

export interface AgentPrompts {
  analyst: string;
  marketer: string;
  writer: string;
  designer: string;
  controller: string;
}

export interface SystemSettings {
  articlesPerRun: number;
  defaultImageModel: string;
  schedulerEnabled: boolean;
  cronSchedule: string;
  supabase: SupabaseConfig;
  agentPrompts?: AgentPrompts;
}

export interface MonthlyAnalyticsMetrics {
  sessions: number;
  activeUsers: number;
  screenPageViews: number;
  averageSessionDuration: number;
  bounceRate: number;
  organicSearchTraffic: number;

  // Previous Month for Comparison
  prevSessions: number;
  prevPageViews: number;
}

export interface MonthlyReportAnalysis {
  evaluation: string;
  kpis: {
    pv_target: number;
    focus_category: string;
  };
  strategy_focus: string;
  action_items: string[];
}

export interface MonthlyReport {
  id: string; // YYYY-MM
  month: string;
  created_at: string;
  metrics: MonthlyAnalyticsMetrics;
  analysis: MonthlyReportAnalysis;
}