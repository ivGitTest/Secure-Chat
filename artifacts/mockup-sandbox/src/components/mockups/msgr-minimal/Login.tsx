import React from 'react';
import { ArrowRight } from 'lucide-react';

export default function LoginScreen() {
  return (
    <div className="w-full h-[100dvh] bg-white flex flex-col font-sans text-zinc-950">
      <div className="flex-1 px-8 pt-24 pb-8 flex flex-col">
        <h1 className="text-5xl font-bold tracking-tight mb-6">Вход</h1>
        <p className="text-zinc-500 text-xl leading-snug mb-16 font-medium">
          Как вас зовут и какой у вас код?
        </p>

        <div className="flex-1 flex flex-col gap-10">
          <div>
            <label className="block text-sm font-bold text-zinc-400 uppercase tracking-widest mb-4">
              Имя пользователя
            </label>
            <input 
              type="text" 
              defaultValue="Ваня"
              className="w-full bg-zinc-100 text-zinc-950 text-2xl font-medium px-6 py-6 rounded-none border-b-4 border-zinc-200 focus:border-[#0044FF] focus:bg-zinc-50 focus:outline-none transition-colors"
            />
          </div>
          <div>
            <label className="block text-sm font-bold text-zinc-400 uppercase tracking-widest mb-4">
              PIN-код
            </label>
            <input 
              type="password" 
              defaultValue="123456"
              maxLength={6}
              className="w-full bg-zinc-100 text-zinc-950 text-3xl font-bold tracking-[0.5em] px-6 py-6 rounded-none border-b-4 border-zinc-200 focus:border-[#0044FF] focus:bg-zinc-50 focus:outline-none transition-colors"
            />
          </div>
        </div>

        <button className="w-full bg-[#0044FF] text-white text-xl font-bold py-6 rounded-2xl flex items-center justify-center gap-3 active:scale-[0.98] transition-transform mt-auto">
          Войти
          <ArrowRight size={28} />
        </button>
      </div>
    </div>
  );
}
