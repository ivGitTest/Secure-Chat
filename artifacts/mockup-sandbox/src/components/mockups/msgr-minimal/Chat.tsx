import React from 'react';
import { ArrowLeft, Phone, SendHorizontal } from 'lucide-react';

export default function ChatScreen() {
  return (
    <div className="w-full h-[100dvh] bg-white flex flex-col font-sans text-zinc-950">
      <div className="px-4 py-4 border-b-2 border-zinc-100 flex items-center justify-between bg-white z-10">
        <div className="flex items-center gap-5">
          <button className="w-14 h-14 flex items-center justify-center rounded-full bg-zinc-100 active:bg-zinc-200 transition-colors">
            <ArrowLeft size={28} />
          </button>
          <div>
            <h1 className="text-3xl font-bold tracking-tight leading-none mb-1">Бабушка</h1>
            <p className="text-sm font-bold text-[#0044FF] uppercase tracking-widest">В сети</p>
          </div>
        </div>
        <button className="w-14 h-14 flex items-center justify-center rounded-full bg-[#0044FF]/10 text-[#0044FF] active:bg-[#0044FF]/20 transition-colors">
          <Phone size={28} />
        </button>
      </div>
      
      <div className="flex-1 overflow-y-auto px-5 pt-8 pb-6 flex flex-col gap-8 bg-zinc-50">
        <div className="self-center bg-zinc-200/60 px-5 py-2 rounded-full text-sm font-bold text-zinc-500 uppercase tracking-widest">
          Сегодня
        </div>
        
        <div className="flex flex-col gap-2 w-full max-w-[85%] self-start">
          <div className="bg-white px-6 py-5 rounded-3xl rounded-tl-sm text-xl font-medium leading-snug shadow-sm border border-zinc-100">
            Ванюша, привет! Как твои дела в школе?
          </div>
          <span className="text-sm font-bold text-zinc-400 pl-2">14:15</span>
        </div>
        
        <div className="flex flex-col gap-2 w-full max-w-[85%] self-start">
          <div className="bg-white px-6 py-5 rounded-3xl rounded-tl-sm text-xl font-medium leading-snug shadow-sm border border-zinc-100">
            Купи хлеба по дороге домой, пожалуйста.
          </div>
          <span className="text-sm font-bold text-zinc-400 pl-2">14:20</span>
        </div>
        
        <div className="flex flex-col gap-2 w-full max-w-[85%] self-end items-end mt-4">
          <div className="bg-[#0044FF] text-white px-6 py-5 rounded-3xl rounded-tr-sm text-xl font-medium leading-snug shadow-sm">
            Хорошо, скоро буду!
          </div>
          <span className="text-sm font-bold text-[#0044FF] pr-2">14:22 · Прочитано</span>
        </div>
      </div>
      
      <div className="px-5 py-5 bg-white border-t-2 border-zinc-100">
        <div className="flex items-end gap-3 bg-zinc-100 p-2.5 rounded-[2rem]">
          <input 
            type="text" 
            placeholder="Сообщение..." 
            className="flex-1 bg-transparent px-5 py-3 min-h-[52px] text-xl font-medium focus:outline-none placeholder:text-zinc-400"
          />
          <button className="w-14 h-14 shrink-0 bg-[#0044FF] rounded-full flex items-center justify-center text-white active:scale-95 transition-transform shadow-md shadow-[#0044FF]/20">
            <SendHorizontal size={24} className="ml-1" />
          </button>
        </div>
      </div>
    </div>
  );
}
