import React from 'react';
import './_group.css';

const contacts = [
  { id: '1', name: 'Мама', lastMsg: 'Купи хлеба по дороге', time: '14:32', unread: 2, online: true },
  { id: '2', name: 'Папа', lastMsg: 'Когда будешь дома?', time: '13:15', unread: 0, online: false },
  { id: '3', name: 'Бабушка', lastMsg: 'Спасибо за фото, внучок!', time: '11:08', unread: 0, online: true },
  { id: '4', name: 'Настя', lastMsg: 'Смотри, что нашла', time: 'Вчера', unread: 1, online: true },
];

export default function Contacts() {
  return (
    <div className="c2-root w-[402px] h-[874px] overflow-hidden flex flex-col" style={{ background: 'var(--bg)' }}>
      {/* Header */}
      <div className="h-20 flex flex-shrink-0 items-end justify-between px-6 pb-4 border-b" style={{ borderColor: 'var(--border)' }}>
        <h1 className="text-[30px] font-bold tracking-tight" style={{ color: 'var(--text-primary)' }}>
          Семья
        </h1>
        <div className="flex items-center gap-1 mb-1">
          <button className="p-2 rounded-full active:bg-black/5 transition-colors">
            <svg className="w-[26px] h-[26px]" style={{ color: 'var(--text-secondary)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </button>
          <button className="p-2 rounded-full active:bg-black/5 transition-colors">
            <svg className="w-[26px] h-[26px]" style={{ color: '#ef4444' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
          </button>
        </div>
      </div>

      {/* Contact list */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {contacts.map((contact) => (
          <button key={contact.id} className="w-full c2-card p-4 flex items-center gap-4 text-left active:scale-[0.98] transition-transform">
            {/* Avatar */}
            <div className="relative flex-shrink-0">
              <div className="w-[60px] h-[60px] rounded-[20px] flex items-center justify-center text-white shadow-sm" style={{ background: 'linear-gradient(135deg, var(--accent) 0%, var(--accent-dim) 100%)' }}>
                <span className="text-[24px] font-bold">
                  {contact.name[0]}
                </span>
              </div>
              {contact.online && (
                <div className="absolute -bottom-1 -right-1 w-[18px] h-[18px] rounded-full border-[3px]" style={{ borderColor: 'var(--surface)', backgroundColor: '#10b981' }} />
              )}
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0 pt-1">
              <div className="flex items-baseline justify-between mb-1">
                <h3 className="text-[18px] font-bold" style={{ color: 'var(--text-primary)' }}>
                  {contact.name}
                </h3>
                <span className="text-[13px] font-bold ml-2" style={{ color: contact.unread > 0 ? 'var(--accent)' : 'var(--text-muted)' }}>
                  {contact.time}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <p className="text-[16px] truncate flex-1" style={{ color: contact.unread > 0 ? 'var(--text-primary)' : 'var(--text-secondary)', fontWeight: contact.unread > 0 ? 600 : 400 }}>
                  {contact.lastMsg}
                </p>
                {contact.unread > 0 && (
                  <div className="flex-shrink-0 min-w-[24px] h-[24px] px-2 rounded-full flex items-center justify-center text-[13px] font-bold text-white shadow-sm" style={{ backgroundColor: 'var(--accent)' }}>
                    {contact.unread}
                  </div>
                )}
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
