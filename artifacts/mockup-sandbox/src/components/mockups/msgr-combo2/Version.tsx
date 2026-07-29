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
    <div className="c2-root w-[402px] h-[874px] overflow-hidden flex flex-col" style={{ background: 'var(--bg)' }}>
      {/* Header bar */}
      <div className="flex-shrink-0 h-16 flex items-center justify-between px-4 border-b" style={{ borderColor: 'var(--border)' }}>
        <button className="p-2">
          <svg className="w-6 h-6" style={{ color: 'var(--accent)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <h2 className="text-[17px] font-bold" style={{ color: 'var(--text-primary)' }}>
          О приложении
        </h2>
        <div className="w-10" />
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-6 space-y-5">
        {/* Version info card */}
        <div className="c2-card overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4">
            <span className="text-[15px]" style={{ color: 'var(--text-secondary)' }}>Версия</span>
            <span className="text-[15px] font-bold" style={{ color: 'var(--text-primary)' }}>1.1.0 (42)</span>
          </div>
          <div className="h-[1.5px] mx-5" style={{ backgroundColor: 'var(--border)' }} />
          <div className="flex items-center justify-between px-5 py-4">
            <span className="text-[15px]" style={{ color: 'var(--text-secondary)' }}>Дата сборки</span>
            <span className="text-[15px] font-bold" style={{ color: 'var(--text-primary)' }}>12 января 2025</span>
          </div>
        </div>

        {/* Update available card */}
        {hasUpdate && (
          <div className="c2-card p-5 border-[2px]" style={{ borderColor: 'var(--accent)', animation: 'slide-up 0.4s ease-out' }}>
            <div className="flex items-start gap-4 mb-4">
              <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0" style={{ backgroundColor: 'var(--accent)' }}>
                <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
                </svg>
              </div>
              <div className="flex-1 min-w-0 pt-1">
                <h3 className="text-[17px] font-bold mb-1" style={{ color: 'var(--text-primary)' }}>
                  Доступна версия 1.2.0
                </h3>
                <p className="text-[13px] font-medium mb-3" style={{ color: 'var(--text-secondary)' }}>
                  от 15 января 2025
                </p>
                <p className="text-[15px] leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                  • Улучшена стабильность звонков{'\n'}
                  • Исправлены ошибки отправки сообщений{'\n'}
                  • Обновлён дизайн уведомлений
                </p>
              </div>
            </div>

            {downloading ? (
              <div className="space-y-3 mt-5">
                <div className="h-2.5 rounded-full overflow-hidden" style={{ backgroundColor: 'rgba(0,68,255,0.1)' }}>
                  <div 
                    className="h-full rounded-full transition-all duration-300"
                    style={{ 
                      width: `${progress}%`,
                      background: 'linear-gradient(90deg, var(--accent), var(--accent-dim))'
                    }}
                  />
                </div>
                <p className="text-[14px] text-center font-bold" style={{ color: 'var(--text-primary)' }}>
                  {progress}%
                </p>
              </div>
            ) : (
              <button
                onClick={handleDownload}
                className="c2-btn mt-3"
                style={{ minHeight: '50px' }}
              >
                Обновить
              </button>
            )}
          </div>
        )}
      </div>

      {/* Bottom action - thumb zone */}
      <div className="p-8 pb-10 mt-auto">
        <button
          onClick={handleCheck}
          disabled={checking}
          className="c2-btn flex items-center justify-center gap-2"
        >
          {checking ? (
            <>
              <svg className="animate-spin w-[22px] h-[22px]" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="white" strokeWidth="4"/>
                <path className="opacity-75" fill="white" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
              </svg>
              Проверка...
            </>
          ) : (
            'Проверить обновления'
          )}
        </button>
      </div>
    </div>
  );
}
