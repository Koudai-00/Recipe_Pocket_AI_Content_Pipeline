import React from 'react';
import { AgentType } from '../types';
import { AGENTS } from '../constants';

interface AgentStatusProps {
  currentStatus: AgentType;
}

const AgentStatus: React.FC<AgentStatusProps> = ({ currentStatus }) => {
  return (
    <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-6">
      {AGENTS.map((agent, index) => {
        const isActive = currentStatus === agent.id;
        const isPast = AGENTS.findIndex(a => a.id === currentStatus) > index || currentStatus === AgentType.COMPLETED;
        
        return (
          <div 
            key={agent.id}
            className={`
              relative flex flex-col items-center p-4 rounded-xl border transition-all duration-300
              ${isActive ? `${agent.bg} border-${agent.color.split('-')[1]}-400 shadow-md scale-105 z-10` : 'bg-white border-slate-200 opacity-60'}
              ${isPast ? 'border-emerald-300 bg-emerald-50 opacity-100' : ''}
            `}
          >
            {/* Connector Line */}
            {index < AGENTS.length - 1 && (
              <div className="hidden md:block absolute top-1/2 -right-4 w-8 h-0.5 bg-slate-300 z-0" />
            )}

            <div className={`
              w-12 h-12 rounded-full flex items-center justify-center mb-3 text-lg
              ${isActive ? `${agent.color} bg-white shadow-sm ring-2 ring-${agent.color.split('-')[1]}-200` : 'text-slate-400 bg-slate-100'}
              ${isPast ? 'bg-emerald-500 text-white' : ''}
            `}>
              {isActive ? (
                <i className={`fas ${agent.icon} animate-pulse`} />
              ) : isPast ? (
                <i className="fas fa-check" />
              ) : (
                <i className={`fas ${agent.icon}`} />
              )}
            </div>
            
            <h3 className={`font-bold text-sm ${isActive ? 'text-slate-800' : 'text-slate-500'}`}>
              {agent.name}
            </h3>
            <p className="text-xs text-center text-slate-400 mt-1 line-clamp-2">
              {isActive ? '処理中...' : agent.role}
            </p>
          </div>
        );
      })}
    </div>
  );
};

export default AgentStatus;