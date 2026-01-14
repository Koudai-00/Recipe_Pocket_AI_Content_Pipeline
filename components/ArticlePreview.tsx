import React, { useState } from 'react';
import { Article } from '../types';
import ReactMarkdown from 'react-markdown'; 

interface ArticlePreviewProps {
  article: Article | null;
  onClose: () => void;
  onPost?: (id: string) => Promise<void>;
}

type Tab = 'preview' | 'reports';
type ReportTab = 'analysis' | 'strategy' | 'design' | 'review';

const ArticlePreview: React.FC<ArticlePreviewProps> = ({ article, onClose, onPost }) => {
  const [activeTab, setActiveTab] = useState<Tab>('preview');
  const [activeReport, setActiveReport] = useState<ReportTab>('analysis');
  const [isPosting, setIsPosting] = useState(false);

  if (!article) return null;

  const handlePostClick = async () => {
    if (onPost && article.status !== 'Posted') {
        setIsPosting(true);
        try {
            await onPost(article.id);
        } finally {
            setIsPosting(false);
        }
    }
  };

  const renderJson = (data: any) => (
    <pre className="bg-slate-900 text-slate-100 p-4 rounded-lg overflow-x-auto text-xs font-mono border border-slate-700 shadow-inner">
      <code>{JSON.stringify(data, null, 2)}</code>
    </pre>
  );

  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex justify-center items-center p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-5xl max-h-[95vh] overflow-hidden flex flex-col animate-fade-in-up">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 bg-slate-50">
          <div className="flex justify-between items-start mb-4">
             <div>
                <h2 className="text-xl font-bold text-slate-800 line-clamp-1">{article.content?.title || article.title}</h2>
                <div className="flex items-center gap-3 mt-1 text-sm">
                   <span className="text-slate-500">ID: {article.id}</span>
                   <span className={`px-2 py-0.5 rounded text-xs font-bold ${article.status === 'Approved' || article.status === 'Posted' ? 'bg-emerald-100 text-emerald-700' : 'bg-yellow-100 text-yellow-700'}`}>
                      {article.status}
                   </span>
                   {article.review && (
                     <span className="font-mono font-bold text-slate-600">
                       Score: <span className={article.review.score >= 80 ? 'text-emerald-600' : 'text-amber-600'}>{article.review.score}</span>
                     </span>
                   )}
                </div>
             </div>
             <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors p-1">
                <i className="fas fa-times text-xl"></i>
             </button>
          </div>

          {/* Main Tabs */}
          <div className="flex space-x-1 border-b border-slate-200">
            <button 
              onClick={() => setActiveTab('preview')}
              className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${activeTab === 'preview' ? 'bg-white text-blue-600 border-x border-t border-slate-200 -mb-px' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100'}`}
            >
              <i className="fas fa-eye mr-2"></i>記事プレビュー
            </button>
            <button 
              onClick={() => setActiveTab('reports')}
              className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${activeTab === 'reports' ? 'bg-white text-purple-600 border-x border-t border-slate-200 -mb-px' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100'}`}
            >
              <i className="fas fa-robot mr-2"></i>Agent Reports (思考プロセス)
            </button>
          </div>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-hidden bg-slate-50">
          
          {/* TAB: PREVIEW */}
          {activeTab === 'preview' && (
            <div className="h-full overflow-y-auto p-6 grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Main Content Column */}
              <div className="md:col-span-2 space-y-6">
                <div className="prose prose-slate max-w-none bg-white p-8 rounded-lg border border-slate-100 shadow-sm">
                    <h1 className="text-3xl font-bold text-slate-900 mb-6">{article.content?.title || article.title}</h1>

                    {/* Thumbnail Image */}
                    <div className="w-full h-64 rounded-lg overflow-hidden relative group border border-slate-200 bg-slate-100 mb-8 shadow-sm">
                      {article.image_urls?.[0] || article.design?.thumbnail_base64 ? (
                        <img 
                          src={article.image_urls?.[0] || article.design?.thumbnail_base64} 
                          alt="Thumbnail" 
                          className="w-full h-full object-cover transition-transform duration-700 hover:scale-105" 
                        />
                      ) : (
                        <div className="w-full h-full flex flex-col items-center justify-center text-slate-400">
                          <i className="fas fa-image text-4xl mb-2"></i>
                          <p className="text-xs max-w-xs text-center px-4">画像生成中 または プロンプトのみ: {article.design?.thumbnail_prompt}</p>
                        </div>
                      )}
                    </div>

                    {/* Content Parts */}
                    <div className="space-y-8">
                        <div className="leading-relaxed font-serif text-lg">
                            <ReactMarkdown>{article.content?.body_p1 || "本文生成エラー"}</ReactMarkdown>
                        </div>
                        
                        {/* Section 1 Image */}
                         <div className="w-full h-48 rounded-lg overflow-hidden bg-slate-100">
                             {article.image_urls?.[1] || article.design?.section1_base64 ? (
                                <img src={article.image_urls?.[1] || article.design?.section1_base64} className="w-full h-full object-cover" />
                             ) : <div className="p-4 text-center text-slate-400">Section 1 Image Placeholder</div>}
                         </div>

                        <div className="leading-relaxed font-serif text-lg">
                            <ReactMarkdown>{article.content?.body_p2 || ""}</ReactMarkdown>
                        </div>

                         {/* Section 2 Image */}
                         <div className="w-full h-48 rounded-lg overflow-hidden bg-slate-100">
                             {article.image_urls?.[2] || article.design?.section2_base64 ? (
                                <img src={article.image_urls?.[2] || article.design?.section2_base64} className="w-full h-full object-cover" />
                             ) : <div className="p-4 text-center text-slate-400">Section 2 Image Placeholder</div>}
                         </div>

                        <div className="leading-relaxed font-serif text-lg">
                            <ReactMarkdown>{article.content?.body_p3 || ""}</ReactMarkdown>
                        </div>
                    </div>
                </div>
              </div>

              {/* Sidebar Metadata */}
              <div className="space-y-6">
                 {/* Generated Assets Gallery */}
                 <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-sm">
                    <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-3">生成アセット一覧</h3>
                    <div className="space-y-4">
                        <div>
                          <span className="text-xs text-slate-400 block mb-1">セクション1用</span>
                          {article.image_urls?.[1] || article.design?.section1_base64 ? (
                            <img src={article.image_urls?.[1] || article.design?.section1_base64} className="w-full h-24 object-cover rounded border border-slate-200" alt="Sec 1" />
                          ) : <div className="w-full h-24 bg-slate-100 rounded text-center pt-8 text-xs text-slate-400">No Image</div>}
                        </div>
                        <div>
                          <span className="text-xs text-slate-400 block mb-1">セクション2用</span>
                          {article.image_urls?.[2] || article.design?.section2_base64 ? (
                            <img src={article.image_urls?.[2] || article.design?.section2_base64} className="w-full h-24 object-cover rounded border border-slate-200" alt="Sec 2" />
                          ) : <div className="w-full h-24 bg-slate-100 rounded text-center pt-8 text-xs text-slate-400">No Image</div>}
                        </div>
                         <div>
                          <span className="text-xs text-slate-400 block mb-1">セクション3用</span>
                          {article.image_urls?.[3] || article.design?.section3_base64 ? (
                            <img src={article.image_urls?.[3] || article.design?.section3_base64} className="w-full h-24 object-cover rounded border border-slate-200" alt="Sec 3" />
                          ) : <div className="w-full h-24 bg-slate-100 rounded text-center pt-8 text-xs text-slate-400">No Image</div>}
                        </div>
                    </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB: REPORTS */}
          {activeTab === 'reports' && (
            <div className="h-full flex flex-col md:flex-row">
              {/* Report Navigation Sidebar */}
              <div className="w-full md:w-64 bg-white border-r border-slate-200 p-2 overflow-y-auto">
                <div className="space-y-1">
                  <button onClick={() => setActiveReport('analysis')} className={`w-full text-left px-4 py-3 rounded-lg text-sm font-medium transition-colors flex items-center ${activeReport === 'analysis' ? 'bg-blue-50 text-blue-700' : 'text-slate-600 hover:bg-slate-50'}`}>
                    <i className="fas fa-chart-line w-6 text-center mr-2 text-blue-500"></i> Analysis
                  </button>
                  <button onClick={() => setActiveReport('strategy')} className={`w-full text-left px-4 py-3 rounded-lg text-sm font-medium transition-colors flex items-center ${activeReport === 'strategy' ? 'bg-purple-50 text-purple-700' : 'text-slate-600 hover:bg-slate-50'}`}>
                    <i className="fas fa-bullseye w-6 text-center mr-2 text-purple-500"></i> Strategy
                  </button>
                  <button onClick={() => setActiveReport('design')} className={`w-full text-left px-4 py-3 rounded-lg text-sm font-medium transition-colors flex items-center ${activeReport === 'design' ? 'bg-pink-50 text-pink-700' : 'text-slate-600 hover:bg-slate-50'}`}>
                    <i className="fas fa-palette w-6 text-center mr-2 text-pink-500"></i> Design Prompts
                  </button>
                  <button onClick={() => setActiveReport('review')} className={`w-full text-left px-4 py-3 rounded-lg text-sm font-medium transition-colors flex items-center ${activeReport === 'review' ? 'bg-orange-50 text-orange-700' : 'text-slate-600 hover:bg-slate-50'}`}>
                    <i className="fas fa-clipboard-check w-6 text-center mr-2 text-orange-500"></i> Review
                  </button>
                </div>
              </div>

              {/* Report Content */}
              <div className="flex-1 p-6 overflow-y-auto bg-slate-50">
                
                {activeReport === 'analysis' && article.analysis_report && (
                  <div className="animate-fade-in space-y-6">
                    <div className="bg-white p-6 rounded-lg border border-slate-200 shadow-sm">
                      <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center">
                        <i className="fas fa-search mr-2 text-blue-500"></i>データ分析結果
                      </h3>
                      <div className="space-y-4">
                        <div>
                          <label className="text-xs font-bold text-slate-500 uppercase">特定トピック</label>
                          <p className="text-lg font-medium text-slate-900">{article.analysis_report.topic}</p>
                        </div>
                        <div>
                           <label className="text-xs font-bold text-slate-500 uppercase">方向性・インサイト</label>
                           <p className="text-slate-700 bg-blue-50 p-3 rounded-md border border-blue-100 mt-1">
                             {article.analysis_report.direction}
                           </p>
                        </div>
                      </div>
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-slate-500 uppercase mb-2 ml-1">Raw JSON Output</h4>
                      {renderJson(article.analysis_report)}
                    </div>
                  </div>
                )}

                {activeReport === 'strategy' && article.marketing_strategy && (
                  <div className="animate-fade-in space-y-6">
                    <div className="bg-white p-6 rounded-lg border border-slate-200 shadow-sm">
                       <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center">
                        <i className="fas fa-chess-knight mr-2 text-purple-500"></i>マーケティング戦略
                      </h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                          <label className="text-xs font-bold text-slate-500 uppercase">記事コンセプト</label>
                          <p className="text-slate-800 mt-1">{article.marketing_strategy.concept}</p>
                        </div>
                        <div>
                          <label className="text-xs font-bold text-slate-500 uppercase">紹介機能</label>
                          <p className="text-slate-800 mt-1">{article.marketing_strategy.function_intro}</p>
                        </div>
                      </div>
                      <div className="mt-6">
                        <label className="text-xs font-bold text-slate-500 uppercase">記事構成案</label>
                        <ul className="mt-2 space-y-2">
                          {article.marketing_strategy.structure.map((item, idx) => (
                            <li key={idx} className="flex items-center text-sm text-slate-700 bg-slate-50 p-2 rounded">
                              <span className="w-6 h-6 rounded-full bg-purple-100 text-purple-600 flex items-center justify-center text-xs font-bold mr-3">{idx + 1}</span>
                              {item}
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-slate-500 uppercase mb-2 ml-1">Raw JSON Output</h4>
                      {renderJson(article.marketing_strategy)}
                    </div>
                  </div>
                )}

                {activeReport === 'design' && article.design && (
                   <div className="animate-fade-in space-y-6">
                      <div className="grid grid-cols-1 gap-4">
                        <div className="bg-white p-4 rounded-lg border border-slate-200">
                          <h4 className="text-sm font-bold text-slate-800 mb-2">Thumbnail Prompt</h4>
                          <p className="text-xs text-slate-600 font-mono bg-slate-50 p-2 rounded border border-slate-100">{article.design.thumbnail_prompt}</p>
                        </div>
                         <div className="bg-white p-4 rounded-lg border border-slate-200">
                          <h4 className="text-sm font-bold text-slate-800 mb-2">Section 1 Prompt</h4>
                          <p className="text-xs text-slate-600 font-mono bg-slate-50 p-2 rounded border border-slate-100">{article.design.section1_prompt}</p>
                        </div>
                      </div>
                      <div>
                        <h4 className="text-xs font-bold text-slate-500 uppercase mb-2 ml-1">Raw JSON Output</h4>
                        {renderJson(article.design)}
                      </div>
                   </div>
                )}

                {activeReport === 'review' && article.review && (
                   <div className="animate-fade-in space-y-6">
                      <div className={`p-6 rounded-lg border shadow-sm ${article.review.score >= 80 ? 'bg-emerald-50 border-emerald-200' : 'bg-amber-50 border-amber-200'}`}>
                         <h3 className="text-lg font-bold text-slate-800 mb-2 flex items-center">
                            <i className={`fas ${article.review.score >= 80 ? 'fa-check-circle text-emerald-500' : 'fa-exclamation-triangle text-amber-500'} mr-2`}></i>
                            品質スコア: {article.review.score} / 100
                         </h3>
                         <p className="text-slate-700 italic">"{article.review.comments}"</p>
                      </div>
                      <div>
                        <h4 className="text-xs font-bold text-slate-500 uppercase mb-2 ml-1">Raw JSON Output</h4>
                        {renderJson(article.review)}
                      </div>
                   </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 bg-white border-t border-slate-200 flex justify-end gap-3 shrink-0">
            <button onClick={onClose} className="px-4 py-2 text-slate-600 hover:text-slate-800 font-medium text-sm transition-colors">閉じる</button>
            <button 
                onClick={handlePostClick}
                disabled={article.status === 'Posted' || isPosting}
                className={`
                    px-4 py-2 rounded-lg text-white shadow-sm text-sm font-medium transition-colors flex items-center
                    ${article.status === 'Posted' 
                        ? 'bg-emerald-500 cursor-default' 
                        : 'bg-slate-900 hover:bg-slate-800'
                    }
                    ${isPosting ? 'opacity-80 cursor-wait' : ''}
                `}
            >
                {isPosting ? (
                    <>
                        <i className="fas fa-circle-notch fa-spin mr-2"></i> 送信中...
                    </>
                ) : article.status === 'Posted' ? (
                    <>
                        <i className="fas fa-check mr-2"></i> 投稿済み
                    </>
                ) : (
                    <>
                        <i className="fas fa-paper-plane mr-2"></i> CMSへ投稿
                    </>
                )}
            </button>
        </div>

      </div>
    </div>
  );
};

export default ArticlePreview;