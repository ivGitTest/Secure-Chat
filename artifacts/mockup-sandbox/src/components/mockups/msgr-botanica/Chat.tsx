import React from 'react';
import { Layout } from './_shared';
import { ArrowLeftIcon, PhoneIcon, SendIcon, MicIcon } from 'lucide-react';

const MESSAGES = [
  { id: 1, text: 'Привет! Ты где?', time: '14:20', me: true },
  { id: 2, text: 'Уже подхожу к дому.', time: '14:22', me: false },
  { id: 3, text: 'Купи хлеба по дороге', time: '14:22', me: false },
  { id: 4, text: 'Хорошо, какой взять?', time: '14:23', me: true },
  { id: 5, text: 'Бородинский и батон', time: '14:25', me: false },
];

export default function ChatScreen() {
  return (
    <Layout>
      <div className="flex-1 flex flex-col pt-12">
        {/* Header */}
        <header className="px-4 pb-4 flex items-center gap-4 bg-[#F4F1E1]/80 backdrop-blur-md z-10 sticky top-0 border-b border-[#D3CEBD]/30">
          <button className="w-12 h-12 flex items-center justify-center bg-[#EAE6D5] rounded-full text-[#4B6043]">
            <ArrowLeftIcon size={24} />
          </button>
          
          <div className="flex-1 flex items-center gap-3">
            <div className="w-11 h-11 rounded-full bg-[#C1C9B6] text-[#4B6043] flex items-center justify-center font-serif text-xl">
              П
            </div>
            <div>
              <h2 className="text-xl font-bold text-[#2B3626] leading-none mb-1">Папа</h2>
              <p className="text-[13px] text-[#758170] font-medium">Был в сети недавно</p>
            </div>
          </div>

          <button className="w-12 h-12 flex items-center justify-center bg-[#4B6043] rounded-full text-[#F4F1E1]">
            <PhoneIcon size={22} fill="currentColor" />
          </button>
        </header>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-6 space-y-4 flex flex-col">
          <div className="text-center mb-4">
            <span className="text-xs font-medium text-[#758170] bg-[#EAE6D5]/50 px-4 py-1.5 rounded-full">
              Сегодня
            </span>
          </div>

          {MESSAGES.map((m) => (
            <div key={m.id} className={`flex ${m.me ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[80%] rounded-[24px] px-5 py-3.5 ${
                m.me 
                  ? 'bg-[#4B6043] text-[#F4F1E1] rounded-br-sm' 
                  : 'bg-[#EAE6D5] text-[#2B3626] rounded-bl-sm border border-[#D3CEBD]/30'
              }`}>
                <p className="text-[17px] leading-[1.3]">{m.text}</p>
                <div className={`text-[11px] font-medium mt-1.5 text-right ${m.me ? 'text-[#C1D2AA]' : 'text-[#758170]'}`}>
                  {m.time} {m.me && '✓✓'}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Input */}
        <div className="px-4 py-4 bg-[#F4F1E1] border-t border-[#D3CEBD]/30 pb-8">
          <div className="bg-[#EAE6D5] rounded-[32px] p-2 flex items-center gap-2 border border-[#D3CEBD]/50">
            <button className="w-12 h-12 flex items-center justify-center text-[#758170]">
              <MicIcon size={26} />
            </button>
            <input 
              type="text" 
              placeholder="Сообщение..." 
              className="flex-1 bg-transparent outline-none text-[17px] text-[#2B3626] placeholder:text-[#A4AC9D]"
            />
            <button className="w-12 h-12 flex items-center justify-center bg-[#4B6043] rounded-full text-[#F4F1E1]">
              <SendIcon size={22} className="ml-0.5" />
            </button>
          </div>
        </div>
      </div>
    </Layout>
  );
}
