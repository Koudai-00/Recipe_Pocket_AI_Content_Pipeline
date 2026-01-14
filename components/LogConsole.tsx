import React, { useEffect, useRef } from 'react';
import { LogEntry, AgentType } from '../types';

interface LogConsoleProps {
  logs: LogEntry[];
}

const LogConsole: React.FC<LogConsoleProps> = ({ logs }) => {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  const getLogColor = (level: string) => {
    switch (level) {
      case 'info': return 'text-slate-300';
      case 'success': return 'text-emerald-400';
      case 'warning': return 'text-amber-400';
      case 'error': return 'text-red-400';
      default: return 'text-slate-300';
    }
  };

  return (
    <div className="bg-slate-900 rounded-lg shadow-inner overflow-hidden flex flex-col h-full border border-slate-700">
      <div className="bg-slate-800 px-4 py-2 border-b border-slate-700 flex justify-between items-center">
        <span className="text-xs font-mono text-slate-400 font-bold uppercase tracking-wider">
          <i className="fas fa-terminal mr-2"></i>システムログ
        </span>
        <span className="text-xs text-slate-500">{logs.length} 件</span>
      </div>
      <div className="flex-1 overflow-y-auto p-4 log-font text-xs space-y-1 scrollbar-hide">
        {logs.length === 0 && (
            <div className="text-slate-600 italic">システム準備完了。実行待機中...</div>
        )}
        {logs.map((log) => (
          <div key={log.id} className="flex gap-2 animate-fade-in">
            <span className="text-slate-500 whitespace-nowrap">[{log.timestamp}]</span>
            <span className={`font-bold whitespace-nowrap w-24 ${
              log.agent === AgentType.ERROR ? 'text-red-500' : 'text-blue-400'
            }`}>
              {log.agent}
            </span>
            <span className={`${getLogColor(log.level)} break-words`}>
              {log.level === 'success' && <i className="fas fa-check mr-1"></i>}
              {log.message}
            </span>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  );
};

export default LogConsole;