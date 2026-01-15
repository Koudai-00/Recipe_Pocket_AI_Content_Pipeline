import React, { useState, useCallback, useEffect } from 'react';
import { v4 as uuidv4 } from 'uuid';
import AgentStatus from './components/AgentStatus';
import LogConsole from './components/LogConsole';
import ArticleList from './components/ArticleList';
import ArticleDetailView from './components/ArticleDetailView';
import SettingsView from './components/SettingsView';
import MonthlyReportView from './components/MonthlyReportView';
import { AgentType, LogEntry, Article, SystemSettings, DesignPrompts } from './types';
import { IMAGE_MODELS } from './constants';
import { analystAgent, marketerAgent, writerAgent, designerAgent, controllerAgent } from './services/geminiService';
import { postToSupabase } from './services/supabaseService';
import { uploadArticleImages, initSupabaseClient } from './services/storageService';
import { saveToFirestore, updateFirestoreStatus, fetchArticles } from './services/firestoreService';

// Simple ID generator
const generateId = () => Math.random().toString(36).substr(2, 9);

type ViewType = 'dashboard' | 'articles' | 'article_detail' | 'analytics' | 'settings';

export default function App() {
  const [currentView, setCurrentView] = useState<ViewType>('dashboard');
  const [status, setStatus] = useState<AgentType>(AgentType.IDLE);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [articles, setArticles] = useState<Article[]>([]);
  const [selectedArticle, setSelectedArticle] = useState<Article | null>(null);
  const [imageModel, setImageModel] = useState<string>(IMAGE_MODELS[0].value);
  const [arkApiKey, setArkApiKey] = useState<string>('');
  const [skipImages, setSkipImages] = useState<boolean>(false);

  // Connection Status State
  const [connStatus, setConnStatus] = useState({
    ga4: 'Checking...',
    gemini: 'Checking...'
  });

  // Global System Settings
  const [systemSettings, setSystemSettings] = useState<SystemSettings>({
    articlesPerRun: 1,
    defaultImageModel: 'seedream-4.5',
    schedulerEnabled: true,
    cronSchedule: '0 9 * * *',
    supabase: {
      url: '',
      anonKey: '',
      authorId: '',
      autoPost: false
    }
  });

  // Fetch Public Config from Backend
  useEffect(() => {
    const fetchConfig = async () => {
      try {
        const res = await fetch('/api/config');
        const data = await res.json();

        // Update Settings
        setSystemSettings(prev => ({
          ...prev,
          supabase: {
            ...prev.supabase,
            url: data.supabaseUrl,
            anonKey: data.supabaseAnonKey,
            authorId: data.supabaseAuthorId
          }
        }));

        // Initialize Storage Client
        if (data.supabaseUrl && data.supabaseAnonKey) {
          initSupabaseClient(data.supabaseUrl, data.supabaseAnonKey);
        }

        // Update Status Indicators
        setConnStatus({
          ga4: data.ga4PropertyId && data.ga4Credentials ? 'Connected' : 'Missing',
          gemini: data.geminiApiKey ? 'Connected' : 'Missing'
        });

      } catch (e) {
        console.error("Failed to fetch config from backend", e);
        addLog(AgentType.ERROR, "バックエンド接続エラー: APIサーバーが起動していない可能性があります。", 'error');
      }
    };
    fetchConfig();

    const fetchPrompts = async () => {
      try {
        const res = await fetch('/api/settings/prompts');
        const data = await res.json();
        if (data.analyst) {
          setSystemSettings((prev: SystemSettings) => ({
            ...prev,
            agentPrompts: data
          }));
          console.log("Loaded custom prompts from Firestore");
        }
      } catch (e) {
        console.error("Failed to fetch prompts:", e);
      }
    };
    fetchPrompts();
  }, []);

  // Fetch Existing Articles from Firestore
  useEffect(() => {
    const loadArticles = async () => {
      try {
        const fetched = await fetchArticles();
        setArticles(fetched);
        console.log(`Loaded ${fetched.length} articles from Firestore.`);
      } catch (e) {
        console.error("Failed to load articles:", e);
        addLog(AgentType.ERROR, "過去記事の読み込みに失敗しました。", 'error');
      }
    };
    loadArticles();
  }, []);

  const addLog = (agent: AgentType, message: string, level: LogEntry['level'] = 'info') => {
    setLogs(prev => [...prev, {
      id: generateId(),
      timestamp: new Date().toLocaleTimeString(),
      agent,
      message,
      level
    }]);
  };

  const runPipeline = useCallback(async () => {
    if (status !== AgentType.IDLE && status !== AgentType.COMPLETED && status !== AgentType.ERROR) return;

    const newArticleId = generateId();
    setStatus(AgentType.ANALYST);
    setLogs([]);
    addLog(AgentType.ANALYST, "パイプラインを開始します。バックエンドAPI経由で分析を実行中...", 'info');

    try {
      // 1. Analyst
      const analysis = await analystAgent(articles, systemSettings.agentPrompts?.analyst);
      addLog(AgentType.ANALYST, `トピック特定完了: ${analysis.topic}`, 'success');

      // 2. Marketer
      setStatus(AgentType.MARKETER);
      addLog(AgentType.MARKETER, "コンテンツ戦略を策定中...", 'info');
      const strategy = await marketerAgent(analysis, articles, systemSettings.agentPrompts?.marketer);
      addLog(AgentType.MARKETER, `タイトル案: ${strategy.title}`, 'success');

      // 3. Writer
      setStatus(AgentType.WRITER);
      addLog(AgentType.WRITER, "記事執筆中...", 'info');
      const rawContent = await writerAgent(strategy, systemSettings.agentPrompts?.writer);

      const parts = rawContent.split('[SPLIT]');
      const body_p1 = parts[0] || "";
      const body_p2 = parts[1] || "";
      const body_p3 = parts[2] || "";

      addLog(AgentType.WRITER, `執筆完了。(Total: ${rawContent.length}文字)`, 'success');

      // 4. Controller (Review FIRST)
      setStatus(AgentType.CONTROLLER);
      addLog(AgentType.CONTROLLER, "記事内容をレビュー中...", 'info');
      const review = await controllerAgent(strategy, rawContent, systemSettings.agentPrompts?.controller);
      const isApproved = review.status === 'APPROVED';
      const finalStatus: Article['status'] = isApproved ? 'Approved' : 'Reviewing';

      addLog(AgentType.CONTROLLER, `レビュー完了: ${isApproved ? '承認 (画像生成へ進みます)' : '修正が必要 (画像生成をスキップします)'}`, isApproved ? 'success' : 'warning');

      // 5. Designer (Conditional: Only if Approved)
      let design: DesignPrompts = { thumbnail_prompt: "", section1_prompt: "", section2_prompt: "", section3_prompt: "" };
      let imageUrls: string[] = [];

      if (isApproved && !skipImages) {
        setStatus(AgentType.DESIGNER);
        addLog(AgentType.DESIGNER, `画像生成中... (Model: ${imageModel})`, 'info');

        design = await designerAgent(strategy.title, rawContent, imageModel, { seedream: arkApiKey }, systemSettings.agentPrompts?.designer);
        addLog(AgentType.DESIGNER, "画像を生成し、Storageへアップロード中...", 'info');

        imageUrls = await uploadArticleImages(newArticleId, design);
        addLog(AgentType.DESIGNER, "画像処理完了", 'success');
      } else {
        if (!isApproved) {
          addLog(AgentType.DESIGNER, "レビュー未承認のため画像生成をスキップ", 'warning');
        } else {
          addLog(AgentType.DESIGNER, "画像生成設定がOFFのためスキップ", 'warning');
        }
      }

      const newArticle: Article = {
        id: newArticleId,
        date: new Date().toISOString(),
        title: strategy.title,
        status: finalStatus,
        topic: analysis.topic,
        analysis_report: analysis,
        marketing_strategy: strategy,
        content: { title: strategy.title, body_p1, body_p2, body_p3 },
        image_urls: imageUrls,
        review,
        design
      };

      // Save to Firestore via Backend
      await saveToFirestore(newArticle);
      addLog(AgentType.CONTROLLER, "Firestoreへ保存完了 (Backend Proxy)", 'info');

      // Auto Post Logic
      if (isApproved && systemSettings.supabase.autoPost) {
        addLog(AgentType.PUBLISHER, "Supabaseへ自動投稿中...", 'info');
        try {
          const supabaseArticle = { ...newArticle, content: rawContent };
          await postToSupabase(supabaseArticle, systemSettings.supabase.url, systemSettings.supabase.anonKey, systemSettings.supabase.authorId);

          await updateFirestoreStatus(newArticleId, 'Posted');
          newArticle.status = 'Posted';
          addLog(AgentType.PUBLISHER, "投稿完了", 'success');
        } catch (e: any) {
          addLog(AgentType.ERROR, `自動投稿失敗: ${e.message}`, 'error');
        }
      }

      setArticles(prev => [newArticle, ...prev]);
      setStatus(AgentType.COMPLETED);
      addLog(AgentType.PUBLISHER, "完了", 'success');

    } catch (error: any) {
      console.error(error);
      setStatus(AgentType.ERROR);
      addLog(AgentType.ERROR, `エラー: ${error.message}`, 'error');
    }
  }, [status, imageModel, articles, arkApiKey, systemSettings, skipImages]);

  const handlePostArticle = async (articleId: string) => {
    const targetArticle = articles.find(a => a.id === articleId);
    if (!targetArticle) return;

    try {
      const fullContent = `${targetArticle.content.body_p1}\n\n${targetArticle.content.body_p2}\n\n${targetArticle.content.body_p3}`;
      const supabaseArticle = { ...targetArticle, content: fullContent };

      await postToSupabase(
        supabaseArticle,
        systemSettings.supabase.url,
        systemSettings.supabase.anonKey,
        systemSettings.supabase.authorId
      );
      await updateFirestoreStatus(articleId, 'Posted');

      setArticles(prev => prev.map(a => a.id === articleId ? { ...a, status: 'Posted' } : a));
      if (selectedArticle?.id === articleId) setSelectedArticle(prev => prev ? { ...prev, status: 'Posted' } : null);
      addLog(AgentType.PUBLISHER, `投稿完了`, 'success');
    } catch (e: any) {
      addLog(AgentType.ERROR, `投稿エラー: ${e.message}`, 'error');
    }
  };

  return (
    <div className="min-h-screen flex flex-col md:flex-row font-sans">
      <aside className="w-full md:w-64 bg-slate-900 text-white flex flex-col shrink-0">
        <div className="p-6 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-emerald-400 to-blue-500 rounded-lg flex items-center justify-center text-white shadow-lg">
              <i className="fas fa-robot text-lg"></i>
            </div>
            <div>
              <h1 className="font-bold text-lg leading-tight">Recipe Pocket</h1>
              <p className="text-xs text-slate-400">Secure AI Pipeline</p>
            </div>
          </div>
        </div>

        {/* Connection Status Indicator */}
        <div className="px-6 py-4 border-b border-slate-800 bg-slate-800/50">
          <div className="flex flex-col gap-2">
            <div className="flex justify-between items-center text-xs">
              <span className="text-slate-400">Backend:</span>
              <span className="text-emerald-400 font-bold">Online</span>
            </div>
            <div className="flex justify-between items-center text-xs">
              <span className="text-slate-400">Gemini Key:</span>
              <span className={connStatus.gemini === 'Connected' ? "text-emerald-400" : "text-red-400"}>{connStatus.gemini}</span>
            </div>
            <div className="flex justify-between items-center text-xs">
              <span className="text-slate-400">GA4 Auth:</span>
              <span className={connStatus.ga4 === 'Connected' ? "text-emerald-400" : "text-red-400"}>{connStatus.ga4}</span>
            </div>
          </div>
        </div>

        <div className="flex-1 flex flex-col overflow-y-auto">
          <nav className="p-4 space-y-1">
            <button onClick={() => setCurrentView('dashboard')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-left ${currentView === 'dashboard' ? 'bg-slate-800 text-white' : 'text-slate-400 hover:bg-slate-800'}`}>
              <i className="fas fa-columns w-5 text-center"></i><span className="font-medium">ダッシュボード</span>
            </button>
            <button onClick={() => setCurrentView('articles')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-left ${currentView === 'articles' || currentView === 'article_detail' ? 'bg-slate-800 text-white' : 'text-slate-400 hover:bg-slate-800'}`}>
              <i className="fas fa-newspaper w-5 text-center"></i><span className="font-medium">記事一覧</span>
            </button>
            <button onClick={() => setCurrentView('analytics')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-left ${currentView === 'analytics' ? 'bg-slate-800 text-white' : 'text-slate-400 hover:bg-slate-800'}`}>
              <i className="fas fa-chart-line w-5 text-center"></i><span className="font-medium">月次レポート</span>
            </button>
            <button onClick={() => setCurrentView('settings')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-left ${currentView === 'settings' ? 'bg-slate-800 text-white' : 'text-slate-400 hover:bg-slate-800'}`}>
              <i className="fas fa-cog w-5 text-center"></i><span className="font-medium">設定</span>
            </button>
          </nav>

          <div className="mt-auto p-6 border-t border-slate-800 bg-slate-900/50">
            <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-3">API Settings</label>
            <div>
              <label className="text-[10px] text-slate-400 block mb-1">Seedream API Key (Optional)</label>
              <input type="password" value={arkApiKey} onChange={(e) => setArkApiKey(e.target.value)} placeholder="Enter Key" className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-2 text-xs text-white" />
            </div>
          </div>
        </div>
      </aside>

      <main className="flex-1 bg-slate-50 overflow-y-auto h-screen">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {currentView === 'dashboard' && (
            <>
              {/* Header & Controls */}
              <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-8 gap-4">
                <div>
                  <h2 className="text-2xl font-bold text-slate-900">記事生成パイプライン</h2>
                  <p className="text-slate-500 mt-1">AIエージェントが記事を自動作成します。</p>
                </div>
                <div className="flex items-center gap-3 bg-white p-1.5 rounded-lg border border-slate-200 shadow-sm">
                  <div className="flex items-center h-full px-3 border-r border-slate-100">
                    <input type="checkbox" id="skip-images" checked={skipImages} onChange={(e) => setSkipImages(e.target.checked)} disabled={status !== AgentType.IDLE && status !== AgentType.COMPLETED && status !== AgentType.ERROR} className="w-4 h-4 text-blue-600 rounded" />
                    <label htmlFor="skip-images" className="ml-2 text-xs font-bold text-slate-500 cursor-pointer">画像生成スキップ</label>
                  </div>
                  <select value={imageModel} onChange={(e) => setImageModel(e.target.value)} className="text-sm font-medium text-slate-700 bg-transparent outline-none pr-2" disabled={skipImages}>
                    {IMAGE_MODELS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                  </select>
                  <button onClick={runPipeline} disabled={status !== AgentType.IDLE && status !== AgentType.COMPLETED && status !== AgentType.ERROR} className={`px-6 py-3 rounded-lg font-bold shadow-md flex items-center gap-2 text-white ${status === AgentType.IDLE || status === AgentType.COMPLETED || status === AgentType.ERROR ? 'bg-blue-600 hover:bg-blue-700' : 'bg-slate-300'}`}>
                    {status === AgentType.IDLE || status === AgentType.COMPLETED || status === AgentType.ERROR ? <><i className="fas fa-play"></i> 実行</> : <><i className="fas fa-circle-notch fa-spin"></i> 処理中</>}
                  </button>
                </div>
              </div>

              <AgentStatus currentStatus={status} />

              <div className="mt-6">
                <LogConsole logs={logs} />
              </div>
            </>
          )}

          {currentView === 'articles' && (
            <ArticleList
              articles={articles}
              onView={(article) => {
                setSelectedArticle(article);
                setCurrentView('article_detail');
              }}
            />
          )}

          {currentView === 'article_detail' && selectedArticle && (
            <ArticleDetailView
              article={selectedArticle}
              onBack={() => setCurrentView('articles')}
              onPost={handlePostArticle}
            />
          )}

          {currentView === 'analytics' && <MonthlyReportView addLog={addLog} />}
          {currentView === 'settings' && <SettingsView settings={systemSettings} onSave={setSystemSettings} />}
        </div>
      </main>
    </div>
  );
}