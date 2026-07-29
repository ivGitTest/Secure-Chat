import React from 'react';
import { Info } from 'lucide-react';

const contacts = [
  { id: 1, name: 'Мама', message: 'Купи хлеба по дороге', time: '14:20', unread: 2, online: true, initial: 'М' },
  { id: 2, name: 'Папа', message: 'Я в гараже', time: '12:05', unread: 0, online: false, initial: 'П' },
  { id: 3, name: 'Бабушка', message: 'Спасибо, внучок!', time: 'Вчера', unread: 0, online: true, initial: 'Б' },
  { id: 4, name: 'Настя', message: 'Скинь фотки с дачи', time: 'Пн', unread: 0, online: false, initial: 'Н' },
];

export default function ContactsScreen() {
  return (
    <div className="w-full h-[100dvh] bg-white flex flex-col font-sans text-zinc-950">
      <div className="px-6 py-6 border-b-2 border-zinc-100 flex items-center justify-between">
        <h1 className="text-4xl font-bold tracking-tight">Семья</h1>
        <button className="w-14 h-14 flex items-center justify-center rounded-full bg-zinc-100 text-zinc-900 active:bg-zinc-200 transition-colors">
          <Info size={28} />
        </button>
      </div>
      
      <div className="flex-1 overflow-y-auto pt-2">
        {contacts.map((c, i) => (
          <div key={c.id} className="flex items-center px-6 py-5 active:bg-zinc-50 transition-colors cursor-pointer group">
            <div className="relative mr-6 shrink-0">
              <div className="w-16 h-16 rounded-full bg-zinc-100 flex items-center justify-center text-2xl font-bold text-zinc-900 group-active:bg-zinc-200 transition-colors">
                {c.initial}
              </div>
              {c.online && (
                <div className="absolute bottom-0 right-0 w-4 h-4 bg-[#0044FF] rounded-full border-[3px] border-white"></div>
              )}
            </div>
            
            <div className="flex-1 min-w-0 py-2 border-b-2 border-zinc-50 group-last:border-none">
              <div className="flex justify-between items-baseline mb-1.5">
                <h2 className="text-2xl font-bold truncate pr-4">{c.name}</h2>
                <span className="text-sm font-bold text-zinc-400 whitespace-nowrap tracking-wide">{c.time}</span>
              </div>
              <p className={`text-lg truncate ${c.unread > 0 ? 'text-zinc-950 font-semibold' : 'text-zinc-500 font-medium'}`}>
                {c.message}
              </p>
            </div>
            
            {c.unread > 0 && (
              <div className="ml-4 w-9 h-9 shrink-0 rounded-full bg-[#0044FF] text-white flex items-center justify-center text-sm font-bold shadow-[0_0_0_4px_white]">
                {c.unread}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
