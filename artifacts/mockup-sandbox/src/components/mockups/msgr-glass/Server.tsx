import React, { useState } from 'react';
import './_group.css';

export default function Server() {
  const [url, setUrl] = useState('');
  const [checking, setChecking] = useState(false);
  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim()) return;
    
    setChecking(true);
    setStatus('idle');
    
    // Simulate connection check
    await new Promise(resolve => setTimeout(resolve, 1200));
    setChecking(false);
    setStatus('success');
  };

  return (
    <div className="msgr-glass-root w-[402px] h-[874px] overflow-hidden relative">
      {/* Background gradient */}
      <div className="absolute inset-0 bg-gradient-to-br from-[#0a0e1a] via-[#0f1629] to-[#050812]" />
      {/* Subtle animated orbs */}
      <div className="absolute top-20 left-10 w-64 h-64 bg-blue-500/10 rounded-full blur-3xl animate-pulse" />
      <div className="absolute bottom-20 right-10 w-48 h-48 bg-purple-500/10 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1s' }} />
      <div className="relative h-full flex flex-col items-center justify-center px-6">
        {/* Logo/Icon area */}
        <div className="mb-8 msgr-glass-card px-6 py-6 msgr-glass-glow">
          <div className="w-16 h-16 mx-auto rounded-2xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center">
            <svg className="w-9 h-9 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
          </div>
        </div>

        <h1 className="text-[28px] font-bold mb-2" style={{ color: 'var(--text-primary)' }}>
          Настройка сервера
        </h1>
        <p className="text-[15px] mb-10 text-center max-w-[280px]" style={{ color: 'var(--text-secondary)' }}>Введите адрес сервера</p>

        <form onSubmit={handleSubmit} className="w-full max-w-[340px] space-y-6">
          <div>
            <label className="block text-[13px] font-semibold mb-2" style={{ color: 'var(--text-secondary)' }}>
              АДРЕС СЕРВЕРА
            </label>
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://chat.example.com"
              className="msgr-glass-input w-full"
              autoCapitalize="none"
              autoCorrect="off"
            />
          </div>

          {status === 'success' && (
            <div className="msgr-glass-card px-4 py-3 flex items-center gap-3" style={{ animationName: 'slide-up', animationDuration: '0.3s' }}>
              <div className="w-5 h-5 rounded-full bg-green-500 flex items-center justify-center flex-shrink-0">
                <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <p className="text-[14px]" style={{ color: 'var(--text-secondary)' }}>
                Соединение установлено
              </p>
            </div>
          )}

          {/* Bottom action area - thumb zone */}
          <div className="pt-16">
            <button
              type="submit"
              disabled={checking || !url.trim()}
              className="msgr-glass-btn msgr-glass-btn-primary w-full disabled:opacity-50 disabled:cursor-not-allowed"
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
                'Продолжить'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
