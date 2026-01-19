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
  const [articleCount, setArticleCount] = useState<number>(1);
  const [articleRequests, setArticleRequests] = useState<string[]>(['']);

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
        const [promptsRes, generalRes] = await Promise.all([
          fetch('/api/settings/prompts'),
          fetch('/api/settings/general')
        ]);

        const promptsData = await promptsRes.json();
        const generalData = await generalRes.json();

        setSystemSettings((prev: SystemSettings) => ({
          ...prev,
          ...(Object.keys(generalData).length > 0 ? generalData : {}),
          agentPrompts: promptsData.analyst ? promptsData : prev.agentPrompts
        }));

        // Also update local state for imageModel if it was loaded
        if (generalData.defaultImageModel) {
          setImageModel(generalData.defaultImageModel);
        }

        console.log("Loaded settings from Firestore");
      } catch (e) {
        console.error("Failed to fetch settings:", e);
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

  // Update article request fields when count changes
  useEffect(() => {
    setArticleRequests(prev => {
      const newRequests = [...prev];
      while (newRequests.length < articleCount) {
        newRequests.push('');
      }
      return newRequests.slice(0, articleCount);
    });
  }, [articleCount]);

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

    setLogs([]);
    addLog(AgentType.ANALYST, `パイプラインを開始します。${articleCount}件の記事を生成します...`, 'info');

    const generatedArticles: Article[] = [];

    try {
      for (let i = 0; i < articleCount; i++) {
        const articleRequest = articleRequests[i]?.trim();
        const newArticleId = generateId();

        if (articleCount > 1) {
          addLog(AgentType.ANALYST, `\n━━━ 記事 ${i + 1}/${articleCount} の生成開始 ━━━`, 'info');
          if (articleRequest) {
            addLog(AgentType.ANALYST, `要望: ${articleRequest}`, 'info');
          }
        }

        // 1. Analyst
        setStatus(AgentType.ANALYST);
        addLog(AgentType.ANALYST, "バックエンドAPI経由で分析を実行中...", 'info');
        const analysis = await analystAgent(articles, systemSettings.agentPrompts?.analyst, articleRequest);
        addLog(AgentType.ANALYST, `トピック特定完了: ${analysis.topic}`, 'success');

        // 2. Marketer
        setStatus(AgentType.MARKETER);
        addLog(AgentType.MARKETER, "コンテンツ戦略を策定中...", 'info');
        const strategy = await marketerAgent(analysis, articles, systemSettings.agentPrompts?.marketer, articleRequest);
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

        // 4. Controller Agent (Review - Initial)
        addLog(AgentType.CONTROLLER, "記事の品質レビュー(初回)を実行中...", 'info');
        let review = await controllerAgent(strategy, rawContent, systemSettings.agentPrompts?.controller);

        let reviewHistory: any[] = [];
        let rewriteAttempted = false;
        let finalContentStr = rawContent;
        let finalReview = review;

        // --- AUTO REWRITE LOGIC ---
        if (review.status !== 'APPROVED') {
          addLog(AgentType.WRITER, `品質スコア(${review.score})が基準未満のため、自動リライトを実行します...`, 'warning');

          reviewHistory.push(review);
          rewriteAttempted = true;

          const rewriteContext = {
            feedback: review.comments,
            currentContent: finalContentStr
          };

          addLog(AgentType.WRITER, "指摘事項に基づき記事を修正中...", 'info');
          finalContentStr = await writerAgent(strategy, systemSettings.agentPrompts?.writer, rewriteContext);

          addLog(AgentType.WRITER, `リライト完了。(Total: ${finalContentStr.length}文字)`, 'success');

          addLog(AgentType.CONTROLLER, "再レビューを実行中...", 'info');
          finalReview = await controllerAgent(strategy, finalContentStr, systemSettings.agentPrompts?.controller);

          reviewHistory.push(finalReview);
        } else {
          reviewHistory.push(review);
        }

        const isApproved = finalReview.status?.toUpperCase() === 'APPROVED';
        const finalStatus: Article['status'] = isApproved ? 'Approved' : 'Reviewing';

        addLog(AgentType.CONTROLLER, `レビュー完了: ${isApproved ? '承認 (画像生成へ進みます)' : '修正が必要 (画像生成をスキップします)'}`, isApproved ? 'success' : 'warning');

        // 5. Designer Agent (Image Prompts & Generation)
        let design: DesignPrompts = { thumbnail_prompt: "", section1_prompt: "", section2_prompt: "", section3_prompt: "" };
        let imageUrls: string[] = [];

        if (isApproved && !skipImages) {
          setStatus(AgentType.DESIGNER);
          addLog(AgentType.DESIGNER, `画像生成中... (Model: ${imageModel})`, 'info');

          try {
            design = await designerAgent(strategy.title, finalContentStr, imageModel, { seedream: arkApiKey }, systemSettings.agentPrompts?.designer);
            addLog(AgentType.DESIGNER, "画像を生成し、Storageへアップロード中...", 'info');

            imageUrls = await uploadArticleImages(newArticleId, design);
            addLog(AgentType.DESIGNER, "画像処理完了", 'success');
          } catch (e: any) {
            console.error("Image Gen Error", e);
            addLog(AgentType.DESIGNER, `画像生成エラー: ${e.message} (スキップします)`, 'error');
          }
        } else {
          if (!isApproved) {
            addLog(AgentType.DESIGNER, `最終ステータスが ${finalStatus} のため、画像生成はスキップします。`, 'warning');
          } else {
            addLog(AgentType.DESIGNER, "画像生成設定がOFFのためスキップ", 'warning');
          }
        }

        const fParts = finalContentStr.split('[SPLIT]');
        const fBody1 = fParts[0] || "";
        const fBody2 = fParts[1] || "";
        const fBody3 = fParts[2] || "";

        const newArticle: Article = {
          id: newArticleId,
          date: new Date().toISOString(),
          title: strategy.title,
          status: finalStatus,
          topic: analysis.topic,
          analysis_report: analysis,
          marketing_strategy: strategy,
          content: { title: strategy.title, body_p1: fBody1, body_p2: fBody2, body_p3: fBody3 },
          image_urls: imageUrls,
          review: finalReview,
          review_history: reviewHistory.length > 0 ? reviewHistory : undefined,
          rewrite_attempted: rewriteAttempted,
          design,
          isImageGenSkipped: skipImages
        };

        await saveToFirestore(newArticle);
        addLog(AgentType.CONTROLLER, "Firestoreへ保存完了", 'info');

        // Auto Post Logic
        if (isApproved && systemSettings.supabase.autoPost) {
          addLog(AgentType.PUBLISHER, "CMSへ自動投稿中...", 'info');
          try {
            const articleToPost = { ...newArticle, content: rawContent };

            const response = await fetch('/api/cms/post', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ article: articleToPost })
            });

            if (!response.ok) {
              const errorData = await response.json();
              throw new Error(errorData.error || 'CMS投稿に失敗しました');
            }

            const result = await response.json();
            console.log('CMS自動投稿成功:', result);

            await updateFirestoreStatus(newArticleId, 'Posted');
            newArticle.status = 'Posted';
            addLog(AgentType.PUBLISHER, `投稿完了 (ID: ${result.id})`, 'success');
          } catch (e: any) {
            console.error('CMS自動投稿エラー:', e);
            addLog(AgentType.ERROR, `自動投稿失敗: ${e.message}`, 'error');
          }
        }

        generatedArticles.push(newArticle);

        if (articleCount > 1) {
          addLog(AgentType.PUBLISHER, `記事 ${i + 1}/${articleCount} 完了`, 'success');
        }
      }

      setArticles(prev => [...generatedArticles, ...prev]);
      setStatus(AgentType.COMPLETED);
      addLog(AgentType.PUBLISHER, `全${articleCount}件の記事生成が完了しました`, 'success');

    } catch (error: any) {
      console.error(error);
      setStatus(AgentType.ERROR);
      addLog(AgentType.ERROR, `エラー: ${error.message}`, 'error');
    }
  }, [status, imageModel, articles, arkApiKey, systemSettings, skipImages, articleCount, articleRequests]);

  const handlePostArticle = async (articleId: string) => {
    const targetArticle = articles.find(a => a.id === articleId);
    if (!targetArticle) return;

    try {
      addLog(AgentType.PUBLISHER, 'CMSへ投稿中...', 'info');

      const fullContent = `${targetArticle.content.body_p1}\n\n${targetArticle.content.body_p2}\n\n${targetArticle.content.body_p3}`;
      const articleToPost = { ...targetArticle, content: fullContent };

      // Post to CMS via backend API (using Service Role Key)
      const response = await fetch('/api/cms/post', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ article: articleToPost })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'CMS投稿に失敗しました');
      }

      const result = await response.json();
      console.log('CMS投稿成功:', result);

      // Update Firestore status
      await updateFirestoreStatus(articleId, 'Posted');

      setArticles(prev => prev.map(a => a.id === articleId ? { ...a, status: 'Posted' } : a));
      if (selectedArticle?.id === articleId) setSelectedArticle(prev => prev ? { ...prev, status: 'Posted' } : null);
      addLog(AgentType.PUBLISHER, `投稿完了 (ID: ${result.id})`, 'success');
    } catch (e: any) {
      console.error('CMS投稿エラー:', e);
      addLog(AgentType.ERROR, `投稿エラー: ${e.message}`, 'error');
    }
  };

  const handleRewrite = async (article: Article) => {
    if (status !== AgentType.IDLE && status !== AgentType.COMPLETED && status !== AgentType.ERROR) return;

    setStatus(AgentType.WRITER);
    setLogs([]);
    addLog(AgentType.WRITER, `記事ID: ${article.id} のリライトを開始します。`, 'info');

    try {
      const rewriteFeedback = article.review?.comments || "品質向上のため、全体的なブラッシュアップをお願いします。";
      const currentContentFull = `${article.content.body_p1}\n${article.content.body_p2}\n${article.content.body_p3}`;

      // 1. Rewrite
      addLog(AgentType.WRITER, "記事を再執筆中... (レビュー指摘を反映)", 'info');
      const rawContent = await writerAgent(
        article.marketing_strategy,
        systemSettings.agentPrompts?.writer,
        { feedback: rewriteFeedback, currentContent: currentContentFull }
      );

      const parts = rawContent.split('[SPLIT]');
      const body_p1 = parts[0] || "";
      const body_p2 = parts[1] || "";
      const body_p3 = parts[2] || "";

      addLog(AgentType.WRITER, "リライト完了。", 'success');

      // 2. Re-Review
      setStatus(AgentType.CONTROLLER);
      addLog(AgentType.CONTROLLER, "修正記事を再レビュー中...", 'info');
      const review = await controllerAgent(article.marketing_strategy, rawContent, systemSettings.agentPrompts?.controller);
      const isApproved = review.status?.toUpperCase() === 'APPROVED';

      addLog(AgentType.CONTROLLER, `再レビュー結果: ${isApproved ? '承認' : '再修正推奨'} (Score: ${review.score})`, isApproved ? 'success' : 'warning');

      // 3. Image Generation (Only if approved AND NOT skipped initially)
      let design = article.design || { thumbnail_prompt: "", section1_prompt: "", section2_prompt: "", section3_prompt: "" };
      let imageUrls = article.image_urls;

      if (isApproved) {
        if (article.isImageGenSkipped) {
          addLog(AgentType.DESIGNER, "初回生成時にスキップ設定されていたため、画像生成をスキップします。", 'warning');
        } else {
          setStatus(AgentType.DESIGNER);
          addLog(AgentType.DESIGNER, `画像生成中... (Model: ${imageModel})`, 'info');
          design = await designerAgent(article.title || "", rawContent, imageModel, { seedream: arkApiKey }, systemSettings.agentPrompts?.designer);

          addLog(AgentType.DESIGNER, "画像をStorageへアップロード中...", 'info');
          imageUrls = await uploadArticleImages(article.id, design); // Existing ID
          addLog(AgentType.DESIGNER, "画像更新完了", 'success');
        }
      }

      // 3.5 Update History & Status
      const previousReview = article.review;
      const newHistory = article.review_history ? [...article.review_history] : [];

      // If the previous review isn't already in history (e.g. from legacy data), add it
      // Note: runPipeline adds ALL reviews to history. 
      // check if previousReview is the last element of newHistory?
      // To be safe and simple: just push previous if exists, AND push new one.
      // Actually, if we just keep pushing, we might duplicate if logic is flawed. 
      // But assuming linear flow: Review1 -> Rewrite -> Review2. 
      // newHistory starts with [Review1]. previousReview is Review1. 
      // We don't want to duplicate Review1.
      // Wait, `runPipeline` saves `review_history: [Review1, Review2]`. `article.review` is Review2.
      // So `article.review_history` ALREADY contains `article.review` (Review2).
      // When we rewrite Review2 -> Review3.
      // `previousReview` is Review2. `newHistory` is `[Review1, Review2]`.
      // We don't need to push `previousReview` again if it's already there.
      // We just need to push the NEW `review` (Review3).

      // However, for articles created BEFORE the auto-rewrite feature, `review_history` might be undefined.
      // In that case, `newHistory` is []. `previousReview` is Review1. We MUST push it.

      const lastHistoryItem = newHistory.length > 0 ? newHistory[newHistory.length - 1] : null;
      // Simple check: if last item score/comments/date matches? logic might be complex.
      // Let's assume if history is empty, push previous. If history exists, assume previous is in it?
      // Safeguard: always push previous if history is empty.
      if (previousReview && newHistory.length === 0) {
        newHistory.push(previousReview);
      }
      // Push NEW review
      newHistory.push(review);

      // 4. Update
      const updatedArticle: Article = {
        ...article,
        status: isApproved ? 'Approved' : 'Reviewing',
        content: { title: article.content.title, body_p1, body_p2, body_p3 },
        review,
        review_history: newHistory,
        rewrite_attempted: true,
        design,
        image_urls: imageUrls,
        date: new Date().toISOString() // Update timestamp? Maybe update 'updatedAt' if exists, but for list sort, date update is fine.
      };

      await saveToFirestore(updatedArticle);
      addLog(AgentType.CONTROLLER, "更新データを保存しました。", 'success');

      setArticles(prev => prev.map(a => a.id === article.id ? updatedArticle : a));
      if (selectedArticle?.id === article.id) setSelectedArticle(updatedArticle);
      setStatus(AgentType.COMPLETED);

    } catch (e: any) {
      console.error(e);
      setStatus(AgentType.ERROR);
      addLog(AgentType.ERROR, `リライトエラー: ${e.message}`, 'error');
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
              <div className="mb-8">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-4 gap-4">
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

                {/* Article Configuration Panel */}
                <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-6">
                  <div className="flex items-center gap-3 mb-4">
                    <i className="fas fa-cog text-blue-500"></i>
                    <h3 className="text-lg font-bold text-slate-800">記事生成設定</h3>
                  </div>

                  <div className="mb-4">
                    <label className="block text-sm font-bold text-slate-700 mb-2">
                      生成する記事数
                    </label>
                    <select
                      value={articleCount}
                      onChange={(e) => setArticleCount(Number(e.target.value))}
                      disabled={status !== AgentType.IDLE && status !== AgentType.COMPLETED && status !== AgentType.ERROR}
                      className="w-full md:w-48 border border-slate-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500 outline-none bg-white"
                    >
                      {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => (
                        <option key={n} value={n}>{n}件</option>
                      ))}
                    </select>
                  </div>

                  {articleCount > 0 && (
                    <div className="space-y-4">
                      <div className="flex items-center gap-2 mb-3">
                        <i className="fas fa-lightbulb text-amber-500"></i>
                        <p className="text-sm text-slate-600">
                          各記事について、作成したい内容を入力してください（任意）。未入力の場合は、データ分析結果から自動でトピックを決定します。
                        </p>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {Array.from({ length: articleCount }).map((_, index) => (
                          <div key={index} className="border border-slate-200 rounded-lg p-4 bg-slate-50">
                            <label className="block text-sm font-bold text-slate-700 mb-2">
                              記事 {index + 1} の内容
                            </label>
                            <textarea
                              value={articleRequests[index] || ''}
                              onChange={(e) => {
                                const newRequests = [...articleRequests];
                                newRequests[index] = e.target.value;
                                setArticleRequests(newRequests);
                              }}
                              disabled={status !== AgentType.IDLE && status !== AgentType.COMPLETED && status !== AgentType.ERROR}
                              placeholder="例: 時短レシピについての記事を作成したい"
                              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none resize-none bg-white"
                              rows={3}
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
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
              onRewrite={handleRewrite}
            />
          )}

          {currentView === 'analytics' && <MonthlyReportView addLog={addLog} />}
          {currentView === 'settings' && <SettingsView settings={systemSettings} onSave={setSystemSettings} />}
        </div>
      </main>
    </div>
  );
}