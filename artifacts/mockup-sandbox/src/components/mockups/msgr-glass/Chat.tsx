import React, { useState } from 'react';
import './_group.css';

const messages = [
  { id: '1', text: 'Привет! Как дела?', isMe: false, time: '14:28' },
  { id: '2', text: 'Хорошо, спасибо! Ты как?', isMe: true, time: '14:29' },
  { id: '3', text: 'Купи хлеба по дороге, пожалуйста', isMe: false, time: '14:32' },
  { id: '4', text: 'Хорошо, куплю', isMe: true, time: '14:32' },
  { id: '5', text: 'И молоко если не забудешь', isMe: false, time: '14:33' },
];

export default function Chat() {
  const [inputText, setInputText] = useState('');

  return (
    <div className="msgr-glass-root w-[402px] h-[874px] overflow-hidden relative flex flex-col">
      {/* Background */}
      <div className="absolute inset-0 bg-gradient-to-br from-[#0a0e1a] via-[#0f1629] to-[#050812]" />
      
      {/* Header */}
      <div className="relative h-16 flex items-center justify-between px-4 msgr-glass-blur border-b flex-shrink-0" style={{ borderColor: 'var(--glass-border)' }}>
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <button className="p-1 flex-shrink-0">
            <svg className="w-6 h-6" style={{ color: 'var(--accent-blue)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div className="relative flex-shrink-0">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center">
                <span className="text-white text-[16px] font-bold">М</span>
              </div>
              <div className="absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-[#0a0e1a]" style={{ backgroundColor: 'var(--accent-green)' }} />
            </div>
            
            <div className="flex-1 min-w-0">
              <h2 className="text-[17px] font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
                Мама
              </h2>
              <p className="text-[13px]" style={{ color: 'var(--text-secondary)' }}>
                в сети
              </p>
            </div>
          </div>
        </div>

        <button className="p-2 flex-shrink-0 ml-2">
          <svg className="w-6 h-6" style={{ color: 'var(--accent-blue)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
          </svg>
        </button>
      </div>

      {/* Messages */}
      <div className="relative flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {messages.map((msg) => (
          <div key={msg.id} className={`flex ${msg.isMe ? 'justify-end' : 'justify-start'}`}>
            <div 
              className="max-w-[75%] rounded-2xl px-4 py-3 msgr-glass-blur"
              style={{
                backgroundColor: msg.isMe ? 'var(--bubble-me)' : 'var(--bubble-them)',
                borderBottomRightRadius: msg.isMe ? '4px' : '16px',
                borderBottomLeftRadius: msg.isMe ? '16px' : '4px',
                border: '1px solid var(--glass-border)',
              }}
            >
              <p className="text-[16px] leading-relaxed mb-1" style={{ color: 'var(--text-primary)' }}>
                {msg.text}
              </p>
              <p className="text-[11px]" style={{ 
                color: msg.isMe ? 'rgba(255,255,255,0.7)' : 'var(--text-muted)',
                textAlign: msg.isMe ? 'right' : 'left'
              }}>
                {msg.time}
              </p>
            </div>
          </div>
        ))}
      </div>

      {/* Input bar - thumb zone */}
      <div className="relative msgr-glass-blur border-t px-4 py-3 flex items-end gap-3 flex-shrink-0" style={{ borderColor: 'var(--glass-border)' }}>
        <div className="flex-1 msgr-glass-card p-3 rounded-2xl">
          <input
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder="Сообщение…"
            className="w-full bg-transparent border-none outline-none text-[16px]"
            style={{ color: 'var(--text-primary)' }}
          />
        </div>
        
        <button 
          className="w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0 msgr-glass-glow transition-transform active:scale-95"
          style={{ 
            background: inputText.trim() 
              ? 'linear-gradient(135deg, var(--accent-blue), var(--accent-blue-dim))' 
              : 'var(--glass-bg)',
            border: '1px solid var(--glass-border)'
          }}
        >
          <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
          </svg>
        </button>
      </div>
    </div>
  );
}
