import React, { useState } from 'react';
import './_group.css';

export default function Version() {
  const [checking, setChecking] = useState(false);
  const [hasUpdate, setHasUpdate] = useState(false);
  const [progress, setProgress] = useState(0);
  const [downloading, setDownloading] = useState(false);

  const handleCheck = async () => {
    setChecking(true);
    await new Promise(resolve => setTimeout(resolve, 1200));
    setChecking(false);
    setHasUpdate(true);
  };

  const handleDownload = async () => {
    setDownloading(true);
    setProgress(0);
    
    const interval = setInterval(() => {
      setProgress(p => {
        if (p >= 100) {
          clearInterval(interval);
          return 100;
        }
        return p + 5;
      });
    }, 100);
  };

  return (
    <div className="msgr-glass-root w-[402px] h-[874px] overflow-hidden relative">
      {/* Background */}
      <div className="absolute inset-0 bg-gradient-to-br from-[#0a0e1a] via-[#0f1629] to-[#050812]" />
      
      {/* Header bar */}
      <div className="relative h-14 flex items-center justify-between px-4 msgr-glass-blur border-b" style={{ borderColor: 'var(--glass-border)' }}>
        <button className="p-2">
          <svg className="w-6 h-6" style={{ color: 'var(--accent-blue)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <h2 className="text-[17px] font-semibold" style={{ color: 'var(--text-primary)' }}>
          О приложении
        </h2>
        <div className="w-10" />
      </div>

      <div className="relative h-[calc(100%-56px)] overflow-y-auto px-4 py-4 space-y-4">
        {/* Version info card */}
        <div className="msgr-glass-card overflow-hidden">
          <div className="flex items-center justify-between px-4 py-4">
            <span className="text-[15px]" style={{ color: 'var(--text-secondary)' }}>Версия</span>
            <span className="text-[15px] font-semibold" style={{ color: 'var(--text-primary)' }}>1.1.0 (42)</span>
          </div>
          <div className="h-px mx-4" style={{ backgroundColor: 'var(--glass-border)' }} />
          <div className="flex items-center justify-between px-4 py-4">
            <span className="text-[15px]" style={{ color: 'var(--text-secondary)' }}>Дата сборки</span>
            <span className="text-[15px] font-semibold" style={{ color: 'var(--text-primary)' }}>12 января 2025</span>
          </div>
        </div>

        {/* Update available card */}
        {hasUpdate && (
          <div className="msgr-glass-card p-4 border-2" style={{ borderColor: 'var(--accent-blue)', animationName: 'slide-up', animationDuration: '0.4s' }}>
            <div className="flex items-start gap-3 mb-3">
              <div className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5" style={{ backgroundColor: 'var(--accent-blue)' }}>
                <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-[16px] font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>
                  Доступна версия 1.2.0
                </h3>
                <p className="text-[13px] mb-2" style={{ color: 'var(--text-secondary)' }}>
                  от 15 января 2025
                </p>
                <p className="text-[14px] leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                  • Улучшена стабильность звонков{'\n'}
                  • Исправлены ошибки отправки сообщений{'\n'}
                  • Обновлён дизайн уведомлений
                </p>
              </div>
            </div>

            {downloading ? (
              <div className="space-y-2 mt-4">
                <div className="h-2 rounded-full overflow-hidden" style={{ backgroundColor: 'rgba(255,255,255,0.1)' }}>
                  <div 
                    className="h-full rounded-full transition-all duration-300"
                    style={{ 
                      width: `${progress}%`,
                      background: 'linear-gradient(90deg, var(--accent-blue), var(--accent-blue-dim))'
                    }}
                  />
                </div>
                <p className="text-[13px] text-center" style={{ color: 'var(--text-secondary)' }}>
                  {progress}%
                </p>
              </div>
            ) : (
              <button
                onClick={handleDownload}
                className="msgr-glass-btn msgr-glass-btn-primary w-full mt-2"
              >
                Обновить
              </button>
            )}
          </div>
        )}

        {/* Bottom action - thumb zone */}
        <div className="pt-12 pb-6">
          <button
            onClick={handleCheck}
            disabled={checking}
            className="msgr-glass-btn w-full msgr-glass-card disabled:opacity-50"
            style={{ color: 'var(--accent-blue)' }}
          >
            {checking ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Проверка...
              </span>
            ) : (
              'Проверить обновления'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
