import React from 'react';
import './_group.css';

// Noble, muted avatar palette — one per contact
const AVATAR_COLORS = [
  '#7B6FA0', // приглушённый сиреневый
  '#5E8C7A', // матовый нефрит
  '#A07A5E', // тёплый терракот
  '#5E7A9C', // стальной синий
  '#8A6F6F', // пыльная роза
  '#6B8A6B', // шалфей
];

const contacts = [
  { id: '1', name: 'Мама', lastMsg: 'Купи хлеба по дороге', time: '14:32', unread: 2, online: true, color: AVATAR_COLORS[0] },
  { id: '2', name: 'Папа', lastMsg: 'Когда будешь дома?', time: '13:15', unread: 0, online: false, color: AVATAR_COLORS[1] },
  { id: '3', name: 'Бабушка', lastMsg: 'Спасибо за фото, внучок!', time: '11:08', unread: 0, online: true, color: AVATAR_COLORS[2] },
  { id: '4', name: 'Настя', lastMsg: 'Смотри, что нашла', time: 'Вчера', unread: 1, online: true, color: AVATAR_COLORS[3] },
];

// Card without border — flat row with thin divider between items
const cardStyle: React.CSSProperties = {
  background: 'transparent',
  border: 'none',
  borderRadius: 0,
  backdropFilter: 'none',
  WebkitBackdropFilter: 'none',
  boxShadow: 'none',
};

export default function ContactsV2() {
  return (
    <div
      className="c2-root w-[402px] h-[874px] overflow-hidden flex flex-col"
      style={{ background: 'var(--bg)' }}
    >
      {/* Header */}
      <div
        className="h-20 flex flex-shrink-0 items-end justify-between px-6 pb-4 border-b"
        style={{ borderColor: 'var(--border)' }}
      >
        <h1 className="text-[30px] font-bold tracking-tight" style={{ color: 'var(--text-primary)' }}>
          Контакты
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

      {/* Contact list — flat rows, thin divider */}
      <div className="flex-1 overflow-y-auto px-4 py-2">
        {contacts.map((contact, idx) => (
          <React.Fragment key={contact.id}>
            <button
              className="w-full py-3 px-2 flex items-center gap-4 text-left active:scale-[0.98] transition-transform"
              style={cardStyle}
            >
              {/* Avatar */}
              <div className="relative flex-shrink-0">
                <div
                  className="w-[56px] h-[56px] rounded-[18px] flex items-center justify-center text-white shadow-sm"
                  style={{ background: contact.color }}
                >
                  <span className="text-[22px] font-bold">{contact.name[0]}</span>
                </div>
                {contact.online && (
                  <div
                    className="absolute -bottom-1 -right-1 w-[16px] h-[16px] rounded-full border-[3px]"
                    style={{ borderColor: 'var(--bg)', backgroundColor: '#10b981' }}
                  />
                )}
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline justify-between mb-0.5">
                  <h3 className="text-[17px] font-bold" style={{ color: 'var(--text-primary)' }}>
                    {contact.name}
                  </h3>
                  <span
                    className="text-[13px] font-semibold ml-2 flex-shrink-0"
                    style={{ color: contact.unread > 0 ? 'var(--accent)' : 'var(--text-muted)' }}
                  >
                    {contact.time}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <p
                    className="text-[15px] truncate flex-1"
                    style={{
                      color: contact.unread > 0 ? 'var(--text-primary)' : 'var(--text-secondary)',
                      fontWeight: contact.unread > 0 ? 600 : 400,
                    }}
                  >
                    {contact.lastMsg}
                  </p>
                  {contact.unread > 0 && (
                    <div
                      className="flex-shrink-0 min-w-[22px] h-[22px] px-1.5 rounded-full flex items-center justify-center text-[12px] font-bold text-white"
                      style={{ backgroundColor: 'var(--accent)' }}
                    >
                      {contact.unread}
                    </div>
                  )}
                </div>
              </div>
            </button>

            {/* Thin divider between rows, not after the last one */}
            {idx < contacts.length - 1 && (
              <div className="mx-[70px]" style={{ height: 1, background: 'var(--border)' }} />
            )}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}
