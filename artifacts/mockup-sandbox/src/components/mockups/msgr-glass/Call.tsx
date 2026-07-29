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
    <div className="msgr-glass-root w-[402px] h-[874px] overflow-hidden relative">
      {/* Animated background */}
      <div className="absolute inset-0 bg-gradient-to-br from-[#0a0e1a] via-[#0f1629] to-[#050812]" />
      
      {/* Pulsing glow effect */}
      <div 
        className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-80 h-80 rounded-full blur-3xl"
        style={{ 
          backgroundColor: 'rgba(74, 144, 255, 0.2)',
          animation: 'pulse-glow 2s ease-in-out infinite'
        }}
      />
      
      <div className="relative h-full flex flex-col items-center justify-between py-12 px-6">
        {/* Top area - status */}
        <div className="text-center">
          <p className="text-[15px] mb-2" style={{ color: 'var(--text-secondary)' }}>
            Голосовой звонок
          </p>
          <h2 className="text-[20px] font-semibold" style={{ color: 'var(--text-primary)' }}>
            {formatDuration(duration)}
          </h2>
        </div>

        {/* Center - large avatar */}
        <div className="flex flex-col items-center">
          <div className="relative mb-6">
            {/* Animated ring */}
            <div 
              className="absolute inset-0 rounded-full border-4 opacity-40"
              style={{ 
                borderColor: 'var(--accent-blue)',
                animation: 'pulse-glow 2s ease-in-out infinite',
                transform: 'scale(1.1)'
              }}
            />
            
            <div className="w-36 h-36 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center msgr-glass-glow relative">
              <span className="text-white text-[64px] font-bold">М</span>
            </div>
          </div>
          
          <h1 className="text-[32px] font-bold mb-2" style={{ color: 'var(--text-primary)' }}>
            Мама
          </h1>
          <p className="text-[16px]" style={{ color: 'var(--accent-green)' }}>
            На связи
          </p>
        </div>

        {/* Bottom - controls (thumb zone) */}
        <div className="w-full space-y-6">
          {/* Secondary controls */}
          <div className="flex items-center justify-center gap-6">
            <button 
              onClick={() => setMuted(!muted)}
              className="w-16 h-16 rounded-full msgr-glass-card flex items-center justify-center transition-all active:scale-95"
              style={{ 
                backgroundColor: muted ? 'var(--accent-red)' : 'var(--glass-bg)',
                border: '1px solid var(--glass-border)'
              }}
            >
              <svg className="w-7 h-7" style={{ color: muted ? 'white' : 'var(--text-primary)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                {muted ? (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" clipRule="evenodd" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                )}
              </svg>
            </button>

            <button className="w-16 h-16 rounded-full msgr-glass-card flex items-center justify-center transition-all active:scale-95" style={{ border: '1px solid var(--glass-border)' }}>
              <svg className="w-7 h-7" style={{ color: 'var(--text-primary)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
              </svg>
            </button>
          </div>

          {/* Primary action - end call */}
          <button 
            className="w-full h-16 rounded-full flex items-center justify-center gap-3 transition-transform active:scale-98"
            style={{ 
              background: 'linear-gradient(135deg, var(--accent-red), #dc2626)',
              boxShadow: '0 4px 20px rgba(239, 68, 68, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.2)'
            }}
          >
            <svg className="w-6 h-6 text-white rotate-[135deg]" fill="currentColor" viewBox="0 0 24 24">
              <path d="M20.01 15.38c-1.23 0-2.42-.2-3.53-.56a.977.977 0 00-1.01.24l-1.57 1.97c-2.83-1.35-5.48-3.9-6.89-6.83l1.95-1.66c.27-.28.35-.67.24-1.02-.37-1.11-.56-2.3-.56-3.53 0-.54-.45-.99-.99-.99H4.19C3.65 3 3 3.24 3 3.99 3 13.28 10.73 21 20.01 21c.71 0 .99-.63.99-1.18v-3.45c0-.54-.45-.99-.99-.99z" />
            </svg>
            <span className="text-white text-[18px] font-semibold">
              Завершить
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
