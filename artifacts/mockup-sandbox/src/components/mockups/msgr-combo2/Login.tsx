import React, { useState } from 'react';
import './_group.css';

export default function Login() {
  const [name, setName] = useState('Ваня');
  const [pin, setPin] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || pin.length !== 6) return;
    setLoading(true);
    await new Promise(r => setTimeout(r, 1000));
    setLoading(false);
  };

  return (
    <div className="c2-root w-[402px] h-[874px] overflow-hidden flex flex-col" style={{ background: 'var(--bg)' }}>
      {/* Верхняя зона: иконка + заголовок */}
      <div className="flex flex-col items-center pt-20 pb-6 px-8">
        <div className="relative mb-7">
          <div className="absolute inset-0 rounded-[26px] blur-xl" style={{ background: 'var(--glow)', transform: 'scale(1.3)' }} />
          <div className="c2-icon-wrap relative">
            <svg width="36" height="36" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
              <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/>
              <circle cx="12" cy="7" r="4"/>
            </svg>
          </div>
        </div>
        <h1 className="text-[30px] font-bold tracking-tight text-center" style={{ color: 'var(--text-primary)' }}>
          Авторизация
        </h1>
        <p className="mt-2 text-[16px] text-center" style={{ color: 'var(--text-secondary)' }}>
          Войдите в семейный мессенджер
        </p>
      </div>

      {/* Поля */}
      <form onSubmit={handleSubmit} className="flex flex-col flex-1 px-8">
        <div className="space-y-5">
          <div className="space-y-2">
            <label className="block text-[12px] font-bold uppercase tracking-widest" style={{ color: 'var(--text-secondary)' }}>
              Имя пользователя
            </label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Введите имя"
              className="c2-input"
              autoCapitalize="words"
            />
          </div>

          <div className="space-y-2">
            <label className="block text-[12px] font-bold uppercase tracking-widest" style={{ color: 'var(--text-secondary)' }}>
              PIN-код (6 цифр)
            </label>
            <input
              type="password"
              value={pin}
              onChange={e => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="••••••"
              maxLength={6}
              inputMode="numeric"
              className="c2-input text-[24px] tracking-[0.4em]"
            />
          </div>
        </div>

        {/* Кнопка в нижней трети */}
        <div className="mt-auto pb-10 space-y-3">
          <button
            type="submit"
            className="c2-btn"
            disabled={!name.trim() || pin.length !== 6 || loading}
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="animate-spin w-5 h-5" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="white" strokeWidth="4"/>
                  <path className="opacity-75" fill="white" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                </svg>
                Вход...
              </span>
            ) : 'Войти'}
          </button>
          <button
            type="button"
            className="w-full py-3 text-[15px] font-medium"
            style={{ color: 'var(--text-muted)' }}
          >
            ← Сменить сервер
          </button>
        </div>
      </form>
    </div>
  );
}
