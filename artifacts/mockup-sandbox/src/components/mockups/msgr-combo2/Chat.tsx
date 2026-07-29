import React, { useState } from 'react';
import './_group.css';

const messages = [
  { id: '1', text: 'Здравствуй, внучок!', isMe: false, time: '14:28' },
  { id: '2', text: 'Привет, бабуль! Как здоровье?', isMe: true, time: '14:29', read: true },
  { id: '3', text: 'Всё хорошо, давление в норме. Спасибо за фото!', isMe: false, time: '14:32' },
  { id: '4', text: 'Рад слышать! Позвоню вечером', isMe: true, time: '14:32', read: true },
];

export default function Chat() {
  const [inputText, setInputText] = useState('');

  return (
    <div className="c2-root w-[402px] h-[874px] overflow-hidden flex flex-col" style={{ background: 'var(--bg)' }}>
      {/* Header */}
      <div className="h-[76px] flex-shrink-0 flex items-center justify-between px-2 border-b c2-card rounded-none border-t-0 border-l-0 border-r-0 shadow-sm relative z-10">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <button className="p-2 flex-shrink-0 rounded-full active:bg-black/5">
            <svg className="w-[28px] h-[28px]" style={{ color: 'var(--accent)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div className="relative flex-shrink-0">
              <div className="w-[46px] h-[46px] rounded-[16px] flex items-center justify-center text-white" style={{ background: 'linear-gradient(135deg, var(--accent) 0%, var(--accent-dim) 100%)' }}>
                <span className="text-[20px] font-bold">Б</span>
              </div>
              <div className="absolute -bottom-1 -right-1 w-[14px] h-[14px] rounded-full border-[2.5px]" style={{ borderColor: 'var(--surface)', backgroundColor: '#10b981' }} />
            </div>
            
            <div className="flex-1 min-w-0">
              <h2 className="text-[18px] font-bold truncate leading-tight" style={{ color: 'var(--text-primary)' }}>
                Бабушка
              </h2>
              <p className="text-[14px] font-bold" style={{ color: '#10b981' }}>
                в сети
              </p>
            </div>
          </div>
        </div>

        <button className="p-3 flex-shrink-0 rounded-full active:bg-black/5 mr-1">
          <svg className="w-[28px] h-[28px]" style={{ color: 'var(--accent)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
          </svg>
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-6 space-y-4">
        {messages.map((msg) => (
          <div key={msg.id} className={`flex ${msg.isMe ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[75%] flex flex-col ${msg.isMe ? 'items-end' : 'items-start'}`}>
              <div 
                className="px-5 py-3.5 shadow-sm"
                style={{
                  backgroundColor: msg.isMe ? 'var(--accent)' : 'var(--surface)',
                  color: msg.isMe ? 'white' : 'var(--text-primary)',
                  borderRadius: '20px',
                  borderBottomRightRadius: msg.isMe ? '6px' : '20px',
                  borderBottomLeftRadius: msg.isMe ? '20px' : '6px',
                  border: msg.isMe ? 'none' : '1.5px solid var(--border)',
                }}
              >
                <p className="text-[17px] leading-relaxed">
                  {msg.text}
                </p>
              </div>
              <div className="flex items-center gap-2 mt-1.5 px-1">
                <span className="text-[13px] font-bold" style={{ color: 'var(--text-muted)' }}>
                  {msg.time}
                </span>
                {msg.isMe && msg.read && (
                  <span className="text-[12px] font-bold uppercase tracking-wider" style={{ color: 'var(--accent)' }}>
                    Прочитано
                  </span>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Input bar */}
      <div className="flex-shrink-0 c2-card rounded-none border-b-0 border-l-0 border-r-0 px-4 py-4 flex items-end gap-3 z-10 pb-8 shadow-[0_-4px_24px_rgba(0,0,0,0.02)]">
        <div className="flex-1 relative">
          <input
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder="Сообщение…"
            className="c2-input w-full"
            style={{ minHeight: '56px' }}
          />
        </div>
        
        <button 
          className="w-[56px] h-[56px] rounded-xl flex items-center justify-center flex-shrink-0 transition-transform active:scale-95"
          style={{ 
            background: inputText.trim() 
              ? 'linear-gradient(135deg, var(--accent) 0%, var(--accent-dim) 100%)' 
              : 'var(--border)',
            boxShadow: inputText.trim() ? '0 6px 20px var(--glow)' : 'none',
            color: inputText.trim() ? 'white' : 'var(--text-muted)'
          }}
        >
          <svg className="w-[26px] h-[26px] relative left-px" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
          </svg>
        </button>
      </div>
    </div>
  );
}
