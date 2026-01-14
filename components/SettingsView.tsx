import React, { useState, useEffect } from 'react';
import { IMAGE_MODELS } from '../constants';
import { SystemSettings } from '../types';

interface SettingsViewProps {
    settings: SystemSettings;
    onSave: (newSettings: SystemSettings) => void;
}

const SettingsView: React.FC<SettingsViewProps> = ({ settings, onSave }) => {
    const [localSettings, setLocalSettings] = useState<SystemSettings>(settings);
    const [isSaving, setIsSaving] = useState(false);
    const [remoteConfig, setRemoteConfig] = useState<Record<string, string>>({});

    // Sync with parent prop changes
    useEffect(() => {
        setLocalSettings(settings);
    }, [settings]);

    // Fetch Remote Config (Env Vars) Status
    useEffect(() => {
        fetch('/api/config')
            .then(res => res.json())
            .then(data => setRemoteConfig(data))
            .catch(err => console.error("Failed to fetch config status:", err));
    }, []);

    const handleSave = () => {
        setIsSaving(true);
        // Simulate save delay
        setTimeout(() => {
            onSave(localSettings);
            setIsSaving(false);
        }, 800);
    };

    const updateSupabase = (field: string, value: any) => {
        setLocalSettings(prev => ({
            ...prev,
            supabase: {
                ...prev.supabase,
                [field]: value
            }
        }));
    };

    // Diagnostic Helpers - Use remote config instead of local process.env
    const ga4PropertyId = remoteConfig.ga4PropertyId;
    const ga4Credentials = remoteConfig.ga4Credentials;
    const geminiApiKey = remoteConfig.geminiApiKey;

    const getCredentialStatus = (val: string | undefined) => {
        if (!val || val === 'MISSING') return { label: '未設定 (Not Found)', color: 'text-red-500', bg: 'bg-red-50', icon: 'fa-times' };
        if (val === 'SET') return { label: '設定済み (Valid JSON)', color: 'text-emerald-600', bg: 'bg-emerald-50', icon: 'fa-check' };
        try {
            JSON.parse(val);
            return { label: '設定済み (Valid JSON)', color: 'text-emerald-600', bg: 'bg-emerald-50', icon: 'fa-check' };
        } catch (e) {
            return { label: '形式エラー (Invalid JSON)', color: 'text-amber-600', bg: 'bg-amber-50', icon: 'fa-exclamation-triangle' };
        }
    };

    const credStatus = getCredentialStatus(ga4Credentials);

    return (
        <div className="max-w-4xl mx-auto animate-fade-in pb-12">
            <h2 className="text-2xl font-bold text-slate-900 mb-6">システム設定</h2>

            {/* Environment Diagnostics (New Section) */}
            <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6 mb-6">
                <h3 className="text-lg font-bold text-slate-800 flex items-center mb-4">
                    <i className="fas fa-plug mr-2 text-slate-500"></i>
                    環境変数・接続ステータス
                </h3>
                <p className="text-sm text-slate-500 mb-4">
                    Secret Manager等から注入された環境変数の認識状況です。
                </p>

                <div className="space-y-3">
                    {/* Gemini API Key */}
                    <div className="flex items-center justify-between p-3 bg-slate-50 rounded border border-slate-100">
                        <div className="flex items-center gap-3">
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center ${geminiApiKey ? 'bg-emerald-100 text-emerald-500' : 'bg-red-100 text-red-500'}`}>
                                <i className={`fas ${geminiApiKey ? 'fa-check' : 'fa-times'}`}></i>
                            </div>
                            <div>
                                <p className="text-sm font-bold text-slate-700">Gemini API Key</p>
                                <p className="text-xs text-slate-400">Server Status</p>
                            </div>
                        </div>
                        <span className={`text-xs font-bold px-2 py-1 rounded ${geminiApiKey ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                            {geminiApiKey ? 'OK' : 'MISSING'}
                        </span>
                    </div>

                    {/* GA4 Property ID */}
                    <div className="flex items-center justify-between p-3 bg-slate-50 rounded border border-slate-100">
                        <div className="flex items-center gap-3">
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center ${ga4PropertyId ? 'bg-emerald-100 text-emerald-500' : 'bg-red-100 text-red-500'}`}>
                                <i className={`fas ${ga4PropertyId ? 'fa-check' : 'fa-times'}`}></i>
                            </div>
                            <div>
                                <p className="text-sm font-bold text-slate-700">GA4 Property ID</p>
                                <p className="text-xs text-slate-400">Server Status</p>
                            </div>
                        </div>
                        <div className="text-right">
                            <span className={`text-xs font-bold px-2 py-1 rounded ${ga4PropertyId ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                                {ga4PropertyId ? 'OK' : 'MISSING'}
                            </span>
                        </div>
                    </div>

                    {/* GA4 Credentials JSON */}
                    <div className="flex items-center justify-between p-3 bg-slate-50 rounded border border-slate-100">
                        <div className="flex items-center gap-3">
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center ${credStatus.bg} ${credStatus.color}`}>
                                <i className={`fas ${credStatus.icon}`}></i>
                            </div>
                            <div>
                                <p className="text-sm font-bold text-slate-700">GA4 Credentials (JSON)</p>
                                <p className="text-xs text-slate-400">Server Status</p>
                            </div>
                        </div>
                        <span className={`text-xs font-bold px-2 py-1 rounded ${credStatus.bg} ${credStatus.color}`}>
                            {credStatus.label}
                        </span>
                    </div>
                </div>
            </div>

            {/* Cloud Scheduler Configuration */}
            <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6 mb-6">
                <div className="flex items-center justify-between mb-6">
                    <h3 className="text-lg font-bold text-slate-800 flex items-center">
                        <i className="fas fa-clock mr-2 text-blue-500"></i>
                        自動実行設定 (Cloud Scheduler)
                    </h3>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => setLocalSettings({ ...localSettings, schedulerEnabled: !localSettings.schedulerEnabled })}
                            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${localSettings.schedulerEnabled ? 'bg-emerald-500' : 'bg-slate-300'}`}
                        >
                            <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${localSettings.schedulerEnabled ? 'translate-x-6' : 'translate-x-1'}`} />
                        </button>
                        <span className="text-sm font-medium text-slate-600 ml-2">{localSettings.schedulerEnabled ? '有効' : '無効'}</span>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                        <label className="block text-sm font-bold text-slate-700 mb-2">
                            実行スケジュール (Cron)
                        </label>
                        <div className="flex items-center gap-2">
                            <input
                                type="text"
                                value={localSettings.cronSchedule}
                                readOnly
                                className="w-full bg-slate-100 border border-slate-300 rounded px-3 py-2 text-slate-600 font-mono text-sm cursor-not-allowed"
                            />
                            <span className="text-xs text-slate-500 whitespace-nowrap font-medium">毎日 9:00</span>
                        </div>
                    </div>
                    <div>
                        <label className="block text-sm font-bold text-slate-700 mb-2">
                            エンドポイントURL
                        </label>
                        <div className="flex items-center gap-2">
                            <input
                                type="text"
                                value="https://api.recipe-pocket.app/schedule"
                                readOnly
                                className="w-full bg-slate-100 border border-slate-300 rounded px-3 py-2 text-slate-600 font-mono text-xs cursor-not-allowed"
                            />
                            <span className="px-2 py-1 bg-slate-200 text-slate-600 text-xs rounded font-bold">POST</span>
                        </div>
                    </div>
                </div>

                <hr className="my-6 border-slate-100" />

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-2">
                            1回あたりの生成記事数
                        </label>
                        <input
                            type="number"
                            min={1}
                            max={10}
                            value={localSettings.articlesPerRun}
                            onChange={(e) => setLocalSettings({ ...localSettings, articlesPerRun: parseInt(e.target.value) })}
                            className="w-full border border-slate-300 rounded px-3 py-2 focus:ring-2 focus:ring-blue-500 outline-none transition-shadow"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-2">
                            デフォルト画像生成モデル
                        </label>
                        <select
                            value={localSettings.defaultImageModel}
                            onChange={(e) => setLocalSettings({ ...localSettings, defaultImageModel: e.target.value })}
                            className="w-full border border-slate-300 rounded px-3 py-2 focus:ring-2 focus:ring-blue-500 outline-none bg-white cursor-pointer"
                        >
                            {IMAGE_MODELS.map(m => (
                                <option key={m.value} value={m.value}>{m.label}</option>
                            ))}
                        </select>
                    </div>
                </div>
            </div>


        </div>
    );
};

export default SettingsView;