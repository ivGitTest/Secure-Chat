import React, { useState } from 'react';
import './_group.css';

export default function Login() {
  const [userId, setUserId] = useState('');
  const [pin, setPin] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userId.trim() || pin.length !== 6) return;
    
    setLoading(true);
    await new Promise(resolve => setTimeout(resolve, 1000));
    setLoading(false);
  };

  return (
    <div className="msgr-glass-root w-[402px] h-[874px] overflow-hidden relative">
      {/* Background */}
      <div className="absolute inset-0 bg-gradient-to-br from-[#0a0e1a] via-[#0f1629] to-[#050812]" />
      
      {/* Decorative glow orbs */}
      <div className="absolute top-32 right-0 w-72 h-72 bg-blue-500/10 rounded-full blur-3xl" />
      <div className="absolute bottom-32 left-0 w-56 h-56 bg-indigo-500/10 rounded-full blur-3xl" />
      
      <div className="relative h-full flex flex-col justify-center px-6">
        {/* App branding */}
        <div className="text-center mb-12">
          <div className="inline-block msgr-glass-card px-8 py-4 msgr-glass-glow mb-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center">
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8h2a2 2 0 012 2v6a2 2 0 01-2 2h-2v4l-4-4H9a1.994 1.994 0 01-1.414-.586m0 0L11 14h4a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2v4l.586-.586z" />
                </svg>
              </div>
              <h1 className="text-[32px] font-bold" style={{ color: 'var(--text-primary)' }}>
                Семья
              </h1>
            </div>
          </div>
          <p className="text-[16px]" style={{ color: 'var(--text-secondary)' }}>
            Войдите в аккаунт
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-[13px] font-semibold mb-2" style={{ color: 'var(--text-secondary)' }}>
              ИМЯ ПОЛЬЗОВАТЕЛЯ
            </label>
            <input
              type="text"
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              placeholder="ваня"
              className="msgr-glass-input w-full"
              autoCapitalize="none"
              autoCorrect="off"
            />
          </div>

          <div>
            <label className="block text-[13px] font-semibold mb-2" style={{ color: 'var(--text-secondary)' }}>
              PIN-КОД (6 ЦИФР)
            </label>
            <input
              type="password"
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="••••••"
              maxLength={6}
              inputMode="numeric"
              className="msgr-glass-input w-full text-2xl tracking-widest"
            />
          </div>

          {/* Bottom thumb zone */}
          <div className="pt-20">
            <button
              type="submit"
              disabled={loading || !userId.trim() || pin.length !== 6}
              className="msgr-glass-btn msgr-glass-btn-primary w-full disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Вход...
                </span>
              ) : (
                'Войти'
              )}
            </button>

            <button
              type="button"
              className="w-full mt-4 py-3 text-[14px]"
              style={{ color: 'var(--text-muted)' }}
            >
              Сменить сервер
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
