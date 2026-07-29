import React from 'react';
import { Layout } from './_shared';
import { PhoneIcon, MicOffIcon, Volume2Icon } from 'lucide-react';

export default function CallScreen() {
  return (
    <Layout hideLeaves>
      {/* Dynamic abstract botanical background for call */}
      <div className="absolute inset-0 bg-[#3A4B34] overflow-hidden">
        <div className="absolute top-[-10%] left-[-20%] w-96 h-96 bg-[#4B6043] rounded-full blur-[100px] opacity-60" />
        <div className="absolute bottom-[-10%] right-[-20%] w-[500px] h-[500px] bg-[#5B7552] rounded-full blur-[120px] opacity-40" />
      </div>

      <div className="relative flex-1 flex flex-col pt-24 pb-16 px-6 z-10 text-[#F4F1E1]">
        <div className="flex-1 flex flex-col items-center">
          <div className="text-center mb-12">
            <h1 className="text-4xl font-serif font-medium tracking-wide mb-2">Бабушка</h1>
            <p className="text-xl text-[#C1D2AA] font-medium">Звоним...</p>
          </div>

          <div className="relative">
            <div className="absolute inset-0 bg-[#C1D2AA] rounded-full blur-2xl opacity-20 animate-pulse" />
            <div className="w-48 h-48 bg-[#EAE6D5] rounded-full flex items-center justify-center text-7xl font-serif text-[#4B6043] shadow-2xl relative border-4 border-[#F4F1E1]/10">
              Б
            </div>
          </div>
        </div>

        {/* Controls - Bottom third */}
        <div className="mt-auto">
          <div className="flex justify-center gap-8 mb-12">
            <button className="w-16 h-16 rounded-full bg-white/10 flex items-center justify-center text-white backdrop-blur-md">
              <MicOffIcon size={28} />
            </button>
            <button className="w-16 h-16 rounded-full bg-white/10 flex items-center justify-center text-white backdrop-blur-md">
              <Volume2Icon size={28} />
            </button>
          </div>

          <div className="flex justify-between px-4">
            <button className="w-20 h-20 bg-[#B2533E] rounded-full flex items-center justify-center text-white shadow-lg active:scale-95 transition-transform">
              <PhoneIcon size={32} className="rotate-[135deg]" fill="currentColor" />
            </button>
            <button className="w-20 h-20 bg-[#6A8A59] rounded-full flex items-center justify-center text-white shadow-lg active:scale-95 transition-transform animate-bounce">
              <PhoneIcon size={32} fill="currentColor" />
            </button>
          </div>
        </div>
      </div>
    </Layout>
  );
}
