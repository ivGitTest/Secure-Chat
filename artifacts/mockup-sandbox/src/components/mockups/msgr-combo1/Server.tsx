import React, { useState } from 'react';
import './_group.css';

export default function Server() {
  const [url, setUrl] = useState('https://chat.naviry.xyz');
  const [status, setStatus] = useState<'idle' | 'checking' | 'ok'>('idle');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim()) return;
    setStatus('checking');
    await new Promise(r => setTimeout(r, 1100));
    setStatus('ok');
  };

  return (
    <div className="c1-root w-[402px] h-[874px] overflow-hidden flex flex-col" style={{ background: 'var(--bg)' }}>
      {/* Верхняя зона: иконка + заголовок */}
      <div className="flex flex-col items-center pt-20 pb-6 px-8">
        <div className="c1-icon-wrap mb-7">
          {/* Иконка сервера */}
          <svg width="36" height="36" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
            <rect x="2" y="2" width="20" height="8" rx="2" ry="2"/>
            <rect x="2" y="14" width="20" height="8" rx="2" ry="2"/>
            <line x1="6" y1="6" x2="6.01" y2="6"/>
            <line x1="6" y1="18" x2="6.01" y2="18"/>
          </svg>
        </div>
        <h1 className="text-[30px] font-bold tracking-tight text-center" style={{ color: 'var(--text-primary)' }}>
          Настройка сервера
        </h1>
        <p className="mt-2 text-[16px] text-center" style={{ color: 'var(--text-secondary)' }}>
          Введите адрес семейного сервера
        </p>
      </div>

      {/* Поля */}
      <form onSubmit={handleSubmit} className="flex flex-col flex-1 px-8">
        <div className="space-y-2">
          <label className="block text-[12px] font-bold uppercase tracking-widest" style={{ color: 'var(--text-secondary)' }}>
            Адрес сервера
          </label>
          <input
            type="url"
            value={url}
            onChange={e => setUrl(e.target.value)}
            placeholder="https://chat.example.com"
            className="c1-input"
            autoCapitalize="none"
            autoCorrect="off"
          />
        </div>

        {status === 'ok' && (
          <div className="mt-4 flex items-center gap-2 px-4 py-3 rounded-xl" style={{ background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)' }}>
            <svg width="18" height="18" fill="none" stroke="#22c55e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
              <path d="M20 6L9 17l-5-5"/>
            </svg>
            <span className="text-[14px] font-medium" style={{ color: '#16a34a' }}>Соединение установлено</span>
          </div>
        )}

        {/* Кнопка в нижней трети — зона большого пальца */}
        <div className="mt-auto pb-10">
          <button type="submit" className="c1-btn" disabled={!url.trim() || status === 'checking'}>
            {status === 'checking' ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="animate-spin w-5 h-5" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="white" strokeWidth="4"/>
                  <path className="opacity-75" fill="white" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                </svg>
                Проверка...
              </span>
            ) : 'Продолжить'}
          </button>
        </div>
      </form>
    </div>
  );
}
