import React, { useState, useEffect } from 'react';
import { MonthlyReport, MonthlyReportAnalysis, AgentType } from '../types';
import { monthlyReportAgent } from '../services/geminiService';
import { fetchMonthlyReports, saveMonthlyReportDoc } from '../services/firestoreService';
import ReactMarkdown from 'react-markdown';

interface MonthlyReportViewProps {
    addLog: (agent: AgentType, message: string, level: 'info' | 'success' | 'warning' | 'error') => void;
}

const MonthlyReportView: React.FC<MonthlyReportViewProps> = ({ addLog }) => {
    const [reports, setReports] = useState<MonthlyReport[]>([]);
    const [selectedReport, setSelectedReport] = useState<MonthlyReport | null>(null);
    const [isGenerating, setIsGenerating] = useState(false);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        loadReports();
    }, []);

    const loadReports = async () => {
        setLoading(true);
        try {
            const fetched = await fetchMonthlyReports();
            // Sort Descending
            fetched.sort((a, b) => b.month.localeCompare(a.month));
            setReports(fetched);
            if (fetched.length > 0) {
                setSelectedReport(fetched[0]);
            }
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    const handleGenerate = async () => {
        setIsGenerating(true);
        addLog(AgentType.ANALYST, "月次レポート生成を開始しました (集計+AI分析)", 'info');

        try {
            const result = await monthlyReportAgent();

            if (!result) {
                throw new Error("Report generation failed");
            }

            const { report } = result;

            // Save to Firestore
            await saveMonthlyReportDoc(report);
            addLog(AgentType.ANALYST, `月次レポート (${report.month}) を保存しました`, 'success');

            // Refresh List
            await loadReports();

            // Set as selected
            const newReports = await fetchMonthlyReports();
            newReports.sort((a, b) => b.month.localeCompare(a.month)); // Re-sort
            setReports(newReports);
            const saved = newReports.find(r => r.id === report.id);
            if (saved) setSelectedReport(saved);

        } catch (e: any) {
            console.error(e);
            addLog(AgentType.ERROR, "レポート生成エラー: " + e.message, 'error');
        } finally {
            setIsGenerating(false);
        }
    };

    if (loading) return <div className="p-12 text-center text-slate-500">Loading reports...</div>;

    return (
        <div className="max-w-7xl mx-auto pb-12 animate-fade-in relative min-h-[600px]">
            {/* Header */}
            <div className="flex justify-between items-center mb-8">
                <div>
                    <h2 className="text-2xl font-bold text-slate-900">月次戦略レポート (PDCA)</h2>
                    <p className="text-sm text-slate-500 mt-1">過去のデータを元に、AIが次月の戦略を立案します。</p>
                    <p className="text-xs text-purple-600 font-bold mt-1">※ 月次レポートは毎月5日に自動作成されます。</p>
                </div>
                <button
                    onClick={handleGenerate}
                    disabled={isGenerating}
                    className={`px-6 py-3 rounded-lg font-bold shadow-md flex items-center gap-2 text-white transition-all ${isGenerating ? 'bg-slate-400 cursor-not-allowed' : 'bg-gradient-to-r from-purple-600 to-indigo-600 hover:shadow-lg hover:scale-105 active:scale-95'}`}
                >
                    {isGenerating ? <><i className="fas fa-spinner fa-spin"></i> 分析中...</> : <><i className="fas fa-magic"></i> 最新レポート生成</>}
                </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
                {/* Sidebar: List */}
                <div className="lg:col-span-1 space-y-3">
                    <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">レポート履歴</h3>
                    {reports.length === 0 && <p className="text-sm text-slate-400 italic">履歴なし</p>}
                    {reports.map((report) => (
                        <button
                            key={report.id}
                            onClick={() => setSelectedReport(report)}
                            className={`w-full text-left p-4 rounded-lg border transition-all ${selectedReport?.id === report.id ? 'bg-white border-purple-500 shadow-md ring-1 ring-purple-500' : 'bg-white border-slate-200 hover:bg-slate-50'}`}
                        >
                            <div className="flex justify-between items-center mb-1">
                                <span className="text-lg font-bold text-slate-800">{report.month}</span>
                                <i className="fas fa-chevron-right text-xs text-slate-300"></i>
                            </div>
                            <div className="text-xs text-slate-500 mb-2">作成日: {new Date(report.created_at).toLocaleDateString()}</div>

                            {/* Mini Metrics */}
                            <div className="flex gap-2">
                                <span className="inline-block px-2 py-1 bg-slate-100 rounded text-[10px] font-bold text-slate-600">
                                    PV: {report.metrics.screenPageViews.toLocaleString()}
                                </span>
                                {report.analysis.kpis?.pv_target && (
                                    <span className={`inline-block px-2 py-1 rounded text-[10px] font-bold ${report.metrics.screenPageViews >= report.analysis.kpis.pv_target ? 'bg-emerald-100 text-emerald-600' : 'bg-amber-100 text-amber-600'}`}>
                                        Goal: {report.analysis.kpis.pv_target.toLocaleString()}
                                    </span>
                                )}
                            </div>
                        </button>
                    ))}
                </div>

                {/* Main Content */}
                <div className="lg:col-span-3">
                    {selectedReport ? (
                        <div className="space-y-6">
                            {/* KPI Cards */}
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div className="bg-white p-6 rounded-lg shadow-sm border border-slate-200">
                                    <p className="text-xs font-bold text-slate-400 uppercase mb-1">Total PV</p>
                                    <p className="text-3xl font-black text-slate-800">{selectedReport.metrics.screenPageViews.toLocaleString()}</p>
                                    <p className="text-xs text-slate-500 mt-2 flex items-center gap-1">
                                        <i className="fas fa-users"></i> Users: {selectedReport.metrics.activeUsers.toLocaleString()}
                                    </p>
                                </div>
                                <div className="bg-white p-6 rounded-lg shadow-sm border border-slate-200">
                                    <p className="text-xs font-bold text-slate-400 uppercase mb-1">次月目標 (KPI)</p>
                                    <p className="text-3xl font-black text-purple-600">
                                        {selectedReport.analysis.kpis?.pv_target ? selectedReport.analysis.kpis.pv_target.toLocaleString() : '-'}
                                    </p>
                                    <p className="text-xs text-slate-500 mt-2">Target PV</p>
                                </div>
                                <div className="bg-white p-6 rounded-lg shadow-sm border border-slate-200">
                                    <p className="text-xs font-bold text-slate-400 uppercase mb-1">注力カテゴリ</p>
                                    <p className="text-xl font-bold text-slate-800 line-clamp-2">
                                        {selectedReport.analysis.kpis?.focus_category || '-'}
                                    </p>
                                    <p className="text-xs text-slate-500 mt-2">Strategy Focus</p>
                                </div>
                            </div>

                            {/* AI Analysis Content */}
                            <div className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden">
                                <div className="px-6 py-4 border-b border-slate-100 bg-slate-50 flex items-center gap-2">
                                    <i className="fas fa-robot text-purple-500"></i>
                                    <h3 className="font-bold text-slate-800">AI 戦略分析レポート</h3>
                                </div>
                                <div className="p-8">
                                    <div className="prose prose-slate max-w-none">
                                        <h4 className="text-lg font-bold text-slate-800 mb-2">📊 今月の評価</h4>
                                        <p className="text-slate-600 mb-6 bg-blue-50 p-4 rounded-lg border-l-4 border-blue-400">
                                            {selectedReport.analysis.evaluation}
                                        </p>

                                        <h4 className="text-lg font-bold text-slate-800 mb-2">🎯 次月の戦略方針</h4>
                                        <p className="text-slate-600 mb-6">
                                            {selectedReport.analysis.strategy_focus}
                                        </p>

                                        <h4 className="text-lg font-bold text-slate-800 mb-2">✅ アクションプラン</h4>
                                        <ul className="list-none space-y-2 mb-0 pl-0">
                                            {selectedReport.analysis.action_items?.map((item, i) => (
                                                <li key={i} className="flex items-start gap-3 p-3 bg-slate-50 rounded border border-slate-100">
                                                    <span className="flex-shrink-0 w-6 h-6 bg-purple-100 text-purple-600 rounded-full flex items-center justify-center text-xs font-bold">{i + 1}</span>
                                                    <span className="text-slate-700 font-medium">{item}</span>
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="h-full flex items-center justify-center text-slate-400 bg-slate-50 rounded-lg border-2 border-dashed border-slate-200">
                            <div className="text-center">
                                <i className="fas fa-chart-pie text-4xl mb-4 text-slate-300"></i>
                                <p>レポートを選択するか、新規生成してください</p>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default MonthlyReportView;
