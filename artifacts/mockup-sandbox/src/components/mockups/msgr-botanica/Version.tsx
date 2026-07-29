import React, { useState } from 'react';
import { Layout } from './_shared';
import { ArrowLeftIcon, InfoIcon, DownloadIcon, CheckCircle2Icon } from 'lucide-react';

export default function VersionScreen() {
  const [updateAvailable, setUpdateAvailable] = useState(true);
  const [progress, setProgress] = useState(0);

  const simulateUpdate = () => {
    let p = 0;
    const interval = setInterval(() => {
      p += 5;
      if (p > 100) {
        clearInterval(interval);
        setUpdateAvailable(false);
      } else {
        setProgress(p);
      }
    }, 100);
  };

  return (
    <Layout>
      <div className="flex-1 flex flex-col pt-12 pb-8">
        <header className="px-4 pb-4 flex items-center gap-4">
          <button className="w-12 h-12 flex items-center justify-center bg-[#EAE6D5] rounded-full text-[#4B6043]">
            <ArrowLeftIcon size={24} />
          </button>
          <h1 className="text-2xl font-serif text-[#2B3626]">О приложении</h1>
        </header>

        <div className="px-6 mt-6 space-y-6 flex-1">
          <div className="bg-[#EAE6D5] rounded-3xl p-6 border border-[#D3CEBD]/50">
            <div className="flex items-center gap-4 mb-6">
              <div className="w-14 h-14 bg-[#F4F1E1] rounded-2xl flex items-center justify-center text-[#4B6043]">
                <InfoIcon size={28} />
              </div>
              <div>
                <h2 className="text-[#2B3626] text-xl font-bold">Семья</h2>
                <p className="text-[#758170] text-sm mt-0.5">Личный мессенджер</p>
              </div>
            </div>
            
            <div className="space-y-4">
              <div className="flex justify-between items-center border-b border-[#D3CEBD]/40 pb-4">
                <span className="text-[#758170] text-base">Версия</span>
                <span className="text-[#2B3626] font-medium text-base">1.1.0 (42)</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-[#758170] text-base">Дата сборки</span>
                <span className="text-[#2B3626] font-medium text-base">20 сентября 2024</span>
              </div>
            </div>
          </div>

          {updateAvailable ? (
            <div className="bg-[#4B6043] rounded-3xl p-6 text-[#F4F1E1] shadow-md">
              <div className="flex items-center gap-3 mb-2">
                <DownloadIcon size={24} className="text-[#C1D2AA]" />
                <h3 className="font-serif text-xl">Доступно обновление</h3>
              </div>
              <p className="text-[#C1D2AA] text-sm mb-5 leading-relaxed">Версия 1.2.0 • Улучшена стабильность звонков и исправлены мелкие ошибки.</p>
              
              {progress > 0 ? (
                <div className="space-y-3 mt-2">
                  <div className="h-3 w-full bg-black/20 rounded-full overflow-hidden">
                    <div className="h-full bg-[#EAE6D5] rounded-full transition-all duration-200" style={{ width: `${progress}%` }} />
                  </div>
                  <p className="text-right text-sm font-medium text-[#C1D2AA]">{progress}%</p>
                </div>
              ) : (
                <button 
                  onClick={simulateUpdate}
                  className="w-full h-14 bg-[#EAE6D5] text-[#4B6043] rounded-2xl text-lg font-medium active:scale-[0.98] transition-transform mt-2"
                >
                  Обновить сейчас
                </button>
              )}
            </div>
          ) : (
            <div className="bg-[#EAE6D5] rounded-3xl p-5 flex items-center justify-center gap-3 border border-[#D3CEBD]/50">
              <CheckCircle2Icon size={24} className="text-[#4B6043]" />
              <span className="text-[#4B6043] font-medium text-lg">У вас последняя версия</span>
            </div>
          )}
        </div>

        <div className="px-6">
          <button className="w-full h-16 bg-[#EAE6D5] text-[#4B6043] rounded-3xl text-xl font-medium border border-[#D3CEBD] active:bg-[#D3CEBD]/50 transition-colors">
            Проверить обновления
          </button>
        </div>
      </div>
    </Layout>
  );
}
