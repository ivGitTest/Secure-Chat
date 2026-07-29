import React, { useState, useEffect } from 'react';
import './_group.css';

export default function Call() {
  const [duration, setDuration] = useState(0);
  const [muted, setMuted] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => {
      setDuration(d => d + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const formatDuration = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div className="c2-root w-[402px] h-[874px] overflow-hidden flex flex-col relative" style={{ background: 'var(--bg)' }}>
      {/* Decorative background glow */}
      <div 
        className="absolute top-[30%] left-1/2 -translate-x-1/2 w-[320px] h-[320px] rounded-full blur-[90px] pointer-events-none"
        style={{ background: 'var(--glow)' }}
      />
      
      <div className="relative h-full flex flex-col items-center justify-between py-16 px-8">
        {/* Top area - status */}
        <div className="text-center pt-8">
          <p className="text-[16px] font-bold uppercase tracking-widest mb-3" style={{ color: 'var(--text-secondary)' }}>
            Голосовой звонок
          </p>
          <h2 className="text-[28px] font-bold" style={{ color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>
            {formatDuration(duration)}
          </h2>
        </div>

        {/* Center - large avatar */}
        <div className="flex flex-col items-center">
          <div className="relative mb-8">
            <div 
              className="absolute inset-0 rounded-[44px] animate-ping opacity-20"
              style={{ backgroundColor: 'var(--accent)' }}
            />
            
            <div className="w-[180px] h-[180px] rounded-[44px] flex items-center justify-center relative shadow-2xl" style={{ background: 'linear-gradient(135deg, var(--accent) 0%, var(--accent-dim) 100%)' }}>
              <span className="text-white text-[80px] font-bold">Б</span>
            </div>
          </div>
          
          <h1 className="text-[36px] font-bold tracking-tight mb-2" style={{ color: 'var(--text-primary)' }}>
            Бабушка
          </h1>
          <p className="text-[18px] font-bold" style={{ color: '#10b981' }}>
            На связи
          </p>
        </div>

        {/* Bottom - controls (thumb zone) */}
        <div className="w-full space-y-6 pb-6">
          {/* Secondary controls */}
          <div className="flex items-center justify-center gap-8">
            <button 
              onClick={() => setMuted(!muted)}
              className="w-[76px] h-[76px] rounded-[24px] c2-card flex items-center justify-center transition-transform active:scale-95 shadow-sm"
              style={{ 
                backgroundColor: muted ? '#fef2f2' : 'var(--surface)',
                borderColor: muted ? '#fecaca' : 'var(--border)',
                color: muted ? '#ef4444' : 'var(--text-primary)'
              }}
            >
              <svg className="w-[32px] h-[32px]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                {muted ? (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" clipRule="evenodd" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                )}
              </svg>
            </button>

            <button className="w-[76px] h-[76px] rounded-[24px] c2-card flex items-center justify-center transition-transform active:scale-95 shadow-sm" style={{ color: 'var(--text-primary)' }}>
              <svg className="w-[32px] h-[32px]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
              </svg>
            </button>
          </div>

          {/* Primary action - end call */}
          <button 
            className="w-full min-h-[68px] rounded-[24px] flex items-center justify-center gap-3 transition-transform active:scale-[0.98]"
            style={{ 
              background: '#ef4444',
              boxShadow: '0 8px 24px rgba(239, 68, 68, 0.3)'
            }}
          >
            <svg className="w-[28px] h-[28px] text-white rotate-[135deg]" fill="currentColor" viewBox="0 0 24 24">
              <path d="M20.01 15.38c-1.23 0-2.42-.2-3.53-.56a.977.977 0 00-1.01.24l-1.57 1.97c-2.83-1.35-5.48-3.9-6.89-6.83l1.95-1.66c.27-.28.35-.67.24-1.02-.37-1.11-.56-2.3-.56-3.53 0-.54-.45-.99-.99-.99H4.19C3.65 3 3 3.24 3 3.99 3 13.28 10.73 21 20.01 21c.71 0 .99-.63.99-1.18v-3.45c0-.54-.45-.99-.99-.99z" />
            </svg>
            <span className="text-white text-[20px] font-bold">
              Завершить
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
