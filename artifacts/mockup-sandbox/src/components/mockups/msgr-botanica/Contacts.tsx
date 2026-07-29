import React from 'react';
import { Layout } from './_shared';
import { SettingsIcon } from 'lucide-react';

const CONTACTS = [
  { id: '1', name: 'Мама', msg: 'Обязательно надень шапку', time: '10:42', unread: 1, online: true, color: 'bg-[#B4C2A3] text-[#3A4B34]' },
  { id: '2', name: 'Папа', msg: 'Купи хлеба по дороге', time: 'Вчера', unread: 0, online: false, color: 'bg-[#C1C9B6] text-[#4B6043]' },
  { id: '3', name: 'Бабушка', msg: 'Спасибо за фото, внучок!', time: 'Вт', unread: 0, online: true, color: 'bg-[#DFD3C3] text-[#7A5C43]' },
  { id: '4', name: 'Настя', msg: 'Во сколько ужинаем?', time: 'Пн', unread: 0, online: false, color: 'bg-[#D2C5B4] text-[#635140]' },
];

export default function ContactsScreen() {
  return (
    <Layout>
      <div className="flex-1 flex flex-col pt-12">
        <header className="px-6 pb-4 flex items-center justify-between">
          <h1 className="text-4xl font-serif text-[#2B3626]">Семья</h1>
          <button className="w-12 h-12 flex items-center justify-center bg-[#EAE6D5] rounded-full text-[#4B6043]">
            <SettingsIcon size={24} />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-4 pb-24 mt-4 space-y-3">
          {CONTACTS.map((c) => (
            <div key={c.id} className="bg-[#EAE6D5]/60 active:bg-[#D3CEBD]/50 transition-colors rounded-3xl p-4 flex items-center gap-4">
              <div className="relative">
                <div className={`w-16 h-16 rounded-full flex items-center justify-center text-3xl font-serif ${c.color}`}>
                  {c.name.charAt(0)}
                </div>
                {c.online && (
                  <div className="absolute bottom-0 right-0 w-[18px] h-[18px] bg-[#6A8A59] border-[3px] border-[#F4F1E1] rounded-full" />
                )}
              </div>
              
              <div className="flex-1 min-w-0 py-1">
                <div className="flex justify-between items-baseline mb-1">
                  <h3 className="text-[22px] font-bold text-[#2B3626] truncate tracking-tight">{c.name}</h3>
                  <span className="text-sm font-medium text-[#758170] ml-2 shrink-0">{c.time}</span>
                </div>
                <p className={`text-base truncate ${c.unread ? 'font-medium text-[#2B3626]' : 'text-[#758170]'}`}>
                  {c.msg}
                </p>
              </div>

              {c.unread > 0 && (
                <div className="w-8 h-8 rounded-full bg-[#4B6043] flex items-center justify-center text-[#F4F1E1] text-sm font-bold shrink-0">
                  {c.unread}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </Layout>
  );
}
