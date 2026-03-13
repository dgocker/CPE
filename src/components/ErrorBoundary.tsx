import React, { useState, useEffect, ReactNode } from 'react';
import { ShieldAlert, RotateCcw } from 'lucide-react';

interface Props {
  children: ReactNode;
}

const ErrorBoundary: React.FC<Props> = ({ children }) => {
  const [hasError, setHasError] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const handleError = (event: ErrorEvent) => {
      setHasError(true);
      setError(event.error);
    };

    window.addEventListener('error', handleError);
    return () => window.removeEventListener('error', handleError);
  }, []);

  if (hasError) {
    return (
      <div className="min-h-screen bg-[#0A0A0C] text-white flex items-center justify-center p-6 font-sans">
        <div className="w-full max-w-md bg-zinc-900/50 border border-red-500/20 rounded-3xl p-8 shadow-2xl text-center">
          <div className="flex justify-center mb-6">
            <div className="w-16 h-16 bg-red-500/20 rounded-2xl flex items-center justify-center">
              <ShieldAlert className="w-8 h-8 text-red-400" />
            </div>
          </div>
          <h1 className="text-xl font-semibold mb-2">Что-то пошло не так</h1>
          <p className="text-zinc-500 text-sm mb-6">
            Произошла ошибка при отрисовке интерфейса. Попробуйте перезагрузить страницу.
          </p>
          <div className="bg-black/50 rounded-xl p-4 mb-8 text-left overflow-hidden">
            <p className="text-[10px] font-mono text-red-400 break-all">
              {error?.message || 'Unknown Error'}
            </p>
          </div>
          <button
            onClick={() => window.location.reload()}
            className="w-full bg-white text-black font-medium py-3 rounded-xl transition-colors hover:bg-zinc-200 flex items-center justify-center gap-2"
          >
            <RotateCcw className="w-4 h-4" />
            Перезагрузить
          </button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};

export default ErrorBoundary;
