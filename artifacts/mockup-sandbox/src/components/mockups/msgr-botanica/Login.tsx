import React, { useState } from 'react';
import { Layout } from './_shared';
import { UserIcon, KeyIcon, LogInIcon } from 'lucide-react';

export default function LoginScreen() {
  const [user, setUser] = useState('');
  const [pin, setPin] = useState('');

  return (
    <Layout>
      <div className="flex-1 flex flex-col px-6 pt-20 pb-12">
        <div className="flex-1">
          <h1 className="text-4xl font-serif text-[#2B3626] mb-3 leading-tight tracking-tight">С возвращением</h1>
          <p className="text-[#758170] text-lg font-medium leading-relaxed mb-10">
            Рады видеть вас дома
          </p>

          <div className="space-y-4">
            <div className="bg-[#EAE6D5] rounded-3xl p-2 pl-5 flex items-center border border-[#D3CEBD]/50 h-16">
              <UserIcon size={24} className="text-[#758170] mr-3" />
              <input 
                type="text"
                value={user}
                onChange={(e) => setUser(e.target.value)}
                placeholder="Имя пользователя"
                className="bg-transparent flex-1 outline-none text-[#2B3626] text-lg placeholder:text-[#A4AC9D]"
              />
            </div>

            <div className="bg-[#EAE6D5] rounded-3xl p-2 pl-5 flex items-center border border-[#D3CEBD]/50 h-16">
              <KeyIcon size={24} className="text-[#758170] mr-3" />
              <input 
                type="password"
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                placeholder="PIN-код"
                maxLength={6}
                inputMode="numeric"
                className="bg-transparent flex-1 outline-none text-[#2B3626] text-2xl tracking-[0.3em] placeholder:text-[#A4AC9D] placeholder:tracking-normal placeholder:text-lg font-mono"
              />
            </div>
          </div>
        </div>

        <div className="mt-auto space-y-4">
          <button 
            className="w-full h-16 bg-[#4B6043] text-[#F4F1E1] rounded-3xl text-xl font-medium flex items-center justify-center gap-3 active:scale-[0.98] transition-transform shadow-sm"
          >
            Войти
            <LogInIcon size={24} />
          </button>
          
          <button className="w-full py-4 text-[#758170] text-base font-medium active:text-[#4B6043] transition-colors">
            Сменить сервер
          </button>
        </div>
      </div>
    </Layout>
  );
}
