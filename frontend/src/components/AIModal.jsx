import React from 'react';
import { X, Bot, Loader2, AlertCircle, RefreshCcw } from 'lucide-react';

const renderRichText = (text) => {
  const lines = String(text || '').split('\n');
  return lines.map((line, index) => {
    const trimmed = line.trim();
    if (!trimmed) return <div key={`spacer-${index}`} className="h-2" />;
    if (trimmed.startsWith('### ')) return <h4 key={index} className="text-base font-semibold text-slate-800 mt-3">{trimmed.replace('### ', '')}</h4>;
    if (trimmed.startsWith('## ')) return <h3 key={index} className="text-lg font-semibold text-slate-900 mt-4">{trimmed.replace('## ', '')}</h3>;
    if (trimmed.startsWith('# ')) return <h2 key={index} className="text-xl font-bold text-slate-900 mt-4">{trimmed.replace('# ', '')}</h2>;
    if (trimmed.startsWith('- ')) return <li key={index} className="ml-5 list-disc text-slate-700">{trimmed.slice(2)}</li>;
    return <p key={index} className="text-slate-700 leading-relaxed">{trimmed}</p>;
  });
};

const AIModal = ({ isOpen, onClose, onRetry, title, loading, status, retryCount, error, explanation }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
      <div className="bg-white w-full max-w-3xl rounded-3xl shadow-2xl p-6 md:p-8 transform transition-all max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="bg-indigo-100 p-3 rounded-xl text-indigo-600">
              <Bot size={28} />
            </div>
            <h2 className="text-2xl font-bold text-slate-800">{title}</h2>
          </div>
          <button 
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition"
          >
            <X size={24} />
          </button>
        </div>

        <div className="bg-slate-50 rounded-2xl p-6 min-h-[220px] border border-slate-100 text-slate-700 overflow-y-auto">
          {loading ? (
            <div className="h-full min-h-[180px] flex flex-col items-center justify-center gap-3 text-indigo-600">
              <Loader2 size={32} className="animate-spin" />
              <span className="font-medium">Generating biological explanation...</span>
              <span className="text-sm text-slate-500">{status || 'Working...'}</span>
              {retryCount > 0 && <span className="text-xs text-amber-600">Retry attempt: {retryCount}</span>}
            </div>
          ) : error ? (
            <div className="space-y-4">
              <div className="flex items-start gap-3 text-red-600">
                <AlertCircle className="mt-0.5" size={18} />
                <div>
                  <p className="font-semibold">Failed to generate AI insight</p>
                  <p className="text-sm text-red-500">{error}</p>
                </div>
              </div>
              <button
                onClick={onRetry}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 transition"
              >
                <RefreshCcw size={14} />
                Retry
              </button>
            </div>
          ) : (
            <div className="space-y-1 text-sm md:text-base">
              {renderRichText(explanation || 'No content available.')}
            </div>
          )}
        </div>
        
        <div className="mt-6 flex justify-end">
          <button onClick={onClose} className="px-6 py-2.5 bg-slate-100 text-slate-700 font-medium rounded-xl hover:bg-slate-200 transition">
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default AIModal;
