'use client';

export function LoadingScreen() {
  return (
    <div className="fixed inset-0 flex flex-col items-center justify-center bg-[#0a0a0a]">
      {/* Animated dots */}
      <div className="flex gap-3 mb-6">
        {[0, 1, 2, 3, 4].map(i => (
          <div
            key={i}
            className="w-3 h-3 rounded-full bg-white/80"
            style={{
              animation: 'loading-dot 1.4s ease-in-out infinite',
              animationDelay: `${i * 0.15}s`,
            }}
          />
        ))}
      </div>
      <p className="text-white/40 text-sm font-light tracking-widest uppercase">
        Loading
      </p>

      <style>{`
        @keyframes loading-dot {
          0%, 80%, 100% {
            opacity: 0.15;
            transform: scale(0.6);
          }
          40% {
            opacity: 1;
            transform: scale(1.2);
          }
        }
      `}</style>
    </div>
  );
}
