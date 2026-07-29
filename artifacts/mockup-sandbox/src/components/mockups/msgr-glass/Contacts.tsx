import React from 'react';
import './_group.css';

const contacts = [
  { id: '1', name: 'Мама', lastMsg: 'Купи хлеба по дороге', time: '14:32', unread: 2, online: true },
  { id: '2', name: 'Папа', lastMsg: 'Когда будешь дома?', time: '13:15', unread: 0, online: false },
  { id: '3', name: 'Бабушка', lastMsg: 'Спасибо большое!', time: '11:08', unread: 0, online: true },
  { id: '4', name: 'Настя', lastMsg: 'Фото: IMG_2847.jpg', time: 'Вчера', unread: 1, online: true },
  { id: '5', name: 'Ваня', lastMsg: 'Позвони бабушке, она просила', time: 'Вт', unread: 0, online: false },
];

export default function Contacts() {
  return (
    <div className="msgr-glass-root w-[402px] h-[874px] overflow-hidden relative">
      {/* Background */}
      <div className="absolute inset-0 bg-gradient-to-br from-[#0a0e1a] via-[#0f1629] to-[#050812]" />
      
      {/* Header */}
      <div className="relative h-16 flex items-center justify-between px-4 msgr-glass-blur border-b" style={{ borderColor: 'var(--glass-border)' }}>
        <h1 className="text-[28px] font-bold" style={{ color: 'var(--text-primary)' }}>
          Семья
        </h1>
        <div className="flex items-center gap-2">
          <button className="p-2">
            <svg className="w-6 h-6" style={{ color: 'var(--text-secondary)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </button>
          <button className="p-2">
            <svg className="w-6 h-6" style={{ color: 'var(--accent-red)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
          </button>
        </div>
      </div>

      {/* Contact list */}
      <div className="relative h-[calc(100%-64px)] overflow-y-auto">
        {contacts.map((contact, idx) => (
          <div key={contact.id}>
            <button className="w-full px-4 py-4 flex items-center gap-3 active:bg-white/5 transition-colors">
              {/* Avatar */}
              <div className="relative flex-shrink-0">
                <div className="w-14 h-14 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center msgr-glass-glow">
                  <span className="text-white text-[20px] font-bold">
                    {contact.name[0]}
                  </span>
                </div>
                {contact.online && (
                  <div className="absolute bottom-0 right-0 w-4 h-4 rounded-full border-2 border-[#0a0e1a]" style={{ backgroundColor: 'var(--accent-green)' }} />
                )}
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline justify-between mb-1">
                  <h3 className="text-[17px] font-semibold" style={{ color: 'var(--text-primary)' }}>
                    {contact.name}
                  </h3>
                  <span className="text-[13px] flex-shrink-0 ml-2" style={{ color: 'var(--text-muted)' }}>
                    {contact.time}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <p className="text-[15px] truncate" style={{ color: 'var(--text-secondary)' }}>
                    {contact.lastMsg}
                  </p>
                  {contact.unread > 0 && (
                    <div className="flex-shrink-0 ml-2 w-5 h-5 rounded-full flex items-center justify-center text-[11px] font-bold text-white" style={{ backgroundColor: 'var(--accent-blue)' }}>
                      {contact.unread}
                    </div>
                  )}
                </div>
              </div>
            </button>
            
            {idx < contacts.length - 1 && (
              <div className="h-px mx-4 ml-[76px]" style={{ backgroundColor: 'var(--glass-border)' }} />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
