import React from 'react';
import { CheckCircle2, ArrowRight } from 'lucide-react';

export default function VersionScreen() {
  return (
    <div className="w-full h-[100dvh] bg-white flex flex-col font-sans text-zinc-950">
      <div className="px-8 py-8 border-b-2 border-zinc-100">
        <h1 className="text-4xl font-bold tracking-tight">О приложении</h1>
      </div>
      
      <div className="flex-1 px-8 pt-10 pb-8 flex flex-col overflow-y-auto">
        <div className="mb-14">
          <div className="flex justify-between items-end mb-6">
            <span className="text-zinc-500 text-xl font-medium">Версия</span>
            <span className="text-3xl font-bold">1.1.0</span>
          </div>
          <div className="flex justify-between items-end">
            <span className="text-zinc-500 text-xl font-medium">Сборка</span>
            <span className="text-2xl font-bold">12 мая 2024</span>
          </div>
        </div>

        <div className="bg-[#0044FF]/5 border-2 border-[#0044FF]/20 rounded-[2rem] p-8 mb-8">
          <div className="flex items-center gap-4 mb-3">
            <CheckCircle2 className="text-[#0044FF]" size={32} />
            <h2 className="text-2xl font-bold text-[#0044FF]">Обновление</h2>
          </div>
          <p className="text-zinc-600 text-lg font-medium mb-8">Версия 1.2.0 готова к установке</p>
          
          <div className="w-full bg-zinc-200 h-3 mb-4 rounded-full overflow-hidden">
            <div className="bg-[#0044FF] w-[65%] h-full rounded-full"></div>
          </div>
          <p className="text-sm font-bold text-zinc-500 text-right uppercase tracking-widest">Загрузка 65%</p>
        </div>

        <div className="mt-auto">
          <button className="w-full border-4 border-zinc-100 text-zinc-900 text-xl font-bold py-6 rounded-2xl flex items-center justify-center gap-3 active:bg-zinc-50 transition-colors">
            Проверить снова
          </button>
        </div>
      </div>
    </div>
  );
}
