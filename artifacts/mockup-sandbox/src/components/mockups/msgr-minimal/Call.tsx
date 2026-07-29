import React from 'react';
import { MicOff, Phone, PhoneOff } from 'lucide-react';

export default function CallScreen() {
  return (
    <div className="w-full h-[100dvh] bg-zinc-950 flex flex-col font-sans text-white">
      <div className="flex-1 flex flex-col items-center justify-center pt-16">
        <div className="relative mb-12">
          <div className="absolute inset-0 bg-[#0044FF] rounded-full blur-[100px] opacity-40 animate-pulse"></div>
          <div className="w-56 h-56 rounded-full bg-zinc-900 flex items-center justify-center text-8xl font-bold text-zinc-200 relative z-10 border-[6px] border-zinc-800 shadow-2xl">
            Б
          </div>
        </div>
        <h1 className="text-6xl font-bold tracking-tight mb-6">Бабушка</h1>
        <div className="bg-zinc-900 px-6 py-2.5 rounded-full">
          <p className="text-xl text-zinc-400 font-bold tracking-widest uppercase">Входящий вызов</p>
        </div>
      </div>
      
      <div className="pb-16 px-6 flex justify-between items-end w-full max-w-sm mx-auto">
        <div className="flex flex-col items-center gap-4">
          <button className="w-20 h-20 rounded-full bg-zinc-800 flex items-center justify-center text-zinc-300 active:scale-95 transition-transform hover:bg-zinc-700">
            <MicOff size={32} />
          </button>
          <span className="text-zinc-500 font-bold uppercase tracking-widest text-xs">Без звука</span>
        </div>
        
        <div className="flex flex-col items-center gap-4">
          <button className="w-24 h-24 rounded-full bg-red-600 flex items-center justify-center text-white active:scale-95 transition-transform shadow-[0_0_40px_rgba(220,38,38,0.4)]">
            <PhoneOff size={40} />
          </button>
          <span className="text-red-500 font-bold uppercase tracking-widest text-xs">Сбросить</span>
        </div>
        
        <div className="flex flex-col items-center gap-4">
          <button className="w-24 h-24 rounded-full bg-emerald-500 flex items-center justify-center text-white active:scale-95 transition-transform shadow-[0_0_40px_rgba(16,185,129,0.4)] animate-bounce">
            <Phone size={40} />
          </button>
          <span className="text-emerald-500 font-bold uppercase tracking-widest text-xs">Принять</span>
        </div>
      </div>
    </div>
  );
}
