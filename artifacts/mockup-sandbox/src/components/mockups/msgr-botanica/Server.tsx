import React, { useState } from 'react';
import { Layout } from './_shared';
import { ServerIcon, ArrowRightIcon } from 'lucide-react';

export default function ServerScreen() {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);

  return (
    <Layout>
      <div className="flex-1 flex flex-col px-6 pt-24 pb-12">
        <div className="flex-1">
          <div className="w-16 h-16 rounded-[24px] bg-[#EAE6D5] text-[#4B6043] flex items-center justify-center mb-6">
            <ServerIcon size={32} strokeWidth={1.5} />
          </div>
          <h1 className="text-4xl font-serif text-[#2B3626] mb-3 leading-tight tracking-tight">Сервер<br/>семьи</h1>
          <p className="text-[#758170] text-lg font-medium leading-relaxed mb-12">
            Введите адрес, чтобы<br/>присоединиться к дому
          </p>

          <div className="bg-[#EAE6D5] rounded-3xl p-2 pl-6 flex items-center shadow-sm border border-[#D3CEBD]/50">
            <input 
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://chat.family.com"
              className="bg-transparent flex-1 outline-none text-[#2B3626] text-lg placeholder:text-[#A4AC9D]"
            />
          </div>
        </div>

        <div className="mt-auto">
          <button 
            className="w-full h-16 bg-[#4B6043] text-[#F4F1E1] rounded-3xl text-xl font-medium flex items-center justify-center gap-3 active:scale-[0.98] transition-transform shadow-sm"
            onClick={() => setLoading(true)}
          >
            {loading ? (
              <div className="w-6 h-6 border-2 border-[#F4F1E1]/30 border-t-[#F4F1E1] rounded-full animate-spin" />
            ) : (
              <>
                Продолжить
                <ArrowRightIcon size={24} />
              </>
            )}
          </button>
        </div>
      </div>
    </Layout>
  );
}
