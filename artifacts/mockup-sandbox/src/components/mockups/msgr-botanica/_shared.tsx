import React from 'react';

export const Layout = ({ children, hideLeaves = false }: { children: React.ReactNode, hideLeaves?: boolean }) => {
  return (
    <div className="relative w-full h-[100dvh] bg-[#F4F1E1] text-[#2B3626] flex flex-col overflow-hidden mx-auto font-sans">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,400;500;600;700&family=Fraunces:opsz,wght@9..144,400;500;600;700&display=swap');
        * {
          -webkit-tap-highlight-color: transparent;
        }
        .font-serif { font-family: 'Fraunces', serif; }
        .font-sans { font-family: 'DM Sans', sans-serif; }
      `}</style>
      
      {!hideLeaves && (
        <>
          <svg className="absolute -top-10 -left-10 w-64 h-64 text-[#4B6043] opacity-[0.03] pointer-events-none -rotate-12" viewBox="0 0 100 100" fill="currentColor">
            <path d="M10,90 Q40,60 50,10 Q60,60 90,90 Q50,70 10,90 Z" />
            <line x1="50" y1="10" x2="50" y2="90" stroke="currentColor" strokeWidth="2" />
            <line x1="50" y1="50" x2="25" y2="70" stroke="currentColor" strokeWidth="1.5" />
            <line x1="50" y1="50" x2="75" y2="70" stroke="currentColor" strokeWidth="1.5" />
          </svg>
          <svg className="absolute bottom-20 -right-20 w-80 h-80 text-[#4B6043] opacity-[0.03] pointer-events-none rotate-45" viewBox="0 0 100 100" fill="currentColor">
            <path d="M50,10 C80,40 90,80 50,90 C10,80 20,40 50,10 Z" />
            <path d="M50,10 L50,90" stroke="currentColor" strokeWidth="2" />
            <path d="M50,40 Q70,40 80,60" stroke="currentColor" strokeWidth="1.5" fill="none" />
            <path d="M50,60 Q30,60 20,80" stroke="currentColor" strokeWidth="1.5" fill="none" />
          </svg>
          <svg className="absolute top-[40%] right-[-10%] w-48 h-48 text-[#4B6043] opacity-[0.02] pointer-events-none -rotate-45" viewBox="0 0 100 100" fill="none" stroke="currentColor">
            <path d="M50,100 Q40,50 60,0" strokeWidth="2" strokeLinecap="round"/>
            <path d="M50,90 Q30,80 20,60" strokeWidth="1.5" strokeLinecap="round"/>
            <path d="M48,70 Q70,60 80,40" strokeWidth="1.5" strokeLinecap="round"/>
            <path d="M47,50 Q25,40 15,20" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
        </>
      )}

      <div className="relative z-10 flex-1 flex flex-col w-full h-full font-sans">
        {children}
      </div>
    </div>
  );
};
