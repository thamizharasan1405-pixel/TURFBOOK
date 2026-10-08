import { ReactNode, useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { getRole, getSession } from '../lib/auth';

type AccessState = 'loading' | 'ok' | 'no' | 'error';

export default function ProtectedRoute({ children, roles }: { children: ReactNode; roles?: string[] }) {
  const location = useLocation();
  const [state, setState] = useState<AccessState>('loading');
  const [error, setError] = useState('');

  useEffect(() => {
    let live = true;

    async function checkAccess() {
      try {
        const { data, error: sessionError } = await getSession();
        if (sessionError) throw sessionError;
        if (!data.session) {
          if (live) setState('no');
          return;
        }

        const role = await getRole(data.session.user.id);
        if (live) setState(!roles || roles.includes(role) ? 'ok' : 'no');
      } catch (cause) {
        if (live) {
          setError(cause instanceof Error ? cause.message : 'Unable to verify account access.');
          setState('error');
        }
      }
    }

    void checkAccess();
    return () => { live = false };
  }, [roles]);

  if (state === 'loading') {
    return <div className="mx-auto max-w-7xl px-5 py-24 text-center text-slate-500">Checking account...</div>;
  }
  if (state === 'error') {
    return <div role="alert" className="mx-auto max-w-2xl px-5 py-24 text-center text-red-300">{error}</div>;
  }
  return state === 'ok' ? <>{children}</> : <Navigate to="/login" replace state={{ from: location.pathname }} />;
}
