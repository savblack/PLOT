// TMDB sends the person back here after they approve (or deny) Plot on
// TMDB's page. This reads the account once and queues the import, then goes
// back to where the import was started, where the dialog shows it queued.
// packages/core/tmdbAccount.js has the whole flow.
import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '@plot/core/supabase.js';
import { createImportReporter, IMPORT_FAILURE_REASONS } from '@plot/core/importPipeline.js';
import { startTmdbAccountImport } from '@plot/core/tmdbAccount.js';
import { IMPORT_VIEW } from '@plot/core/copy/importView.js';
import { consumeTmdbRequest, tmdbErrorReturn } from '../utils/redirects.js';
import { CONNECT_BACK_LABELS } from '../copy/traktCallbackPage.js';
import PlotLogo from '../components/PlotLogo.jsx';

/** The page the import started on, without the ?import=tmdb that reopens its dialog. */
function startedFrom(returnTo) {
  if (!returnTo) return null;
  const url = new URL(returnTo, window.location.origin);
  url.searchParams.delete('import');
  return `${url.pathname}${url.search}`;
}

export default function TmdbCallbackPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [error, setError] = useState('');
  const [back, setBack] = useState(() => tmdbErrorReturn(null));
  const called = useRef(false);

  useEffect(() => {
    if (called.current) return;
    called.current = true;
    const run = async () => {
      const requestToken = params.get('request_token') || '';
      // The token can read the account until it is used: keep it out of the
      // address bar and history (analytics redact it too, utils/redactUrl.js).
      window.history.replaceState(window.history.state, '', window.location.pathname);
      const request = consumeTmdbRequest(requestToken);
      const reporter = createImportReporter({ entry: request?.entry || undefined });
      const fail = (message) => {
        reporter.report('failed', { source: 'tmdb', reason: IMPORT_FAILURE_REASONS.CONNECTION_FAILED });
        setBack(tmdbErrorReturn(startedFrom(request?.returnTo)));
        setError(message);
      };
      // Denied on TMDB's page, or a link this tab did not start.
      if (!request || params.get('denied') === 'true' || params.get('approved') !== 'true') {
        fail(IMPORT_VIEW.tmdbNotApproved); return;
      }
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { navigate('/login', { replace: true }); return; }
      const { error: failure, count } = await startTmdbAccountImport({
        userId: session.user.id, requestToken, binding: request.binding, entry: request.entry || undefined,
      });
      if (failure) { fail(failure.message); return; }
      reporter.report('started', { source: 'tmdb', count });
      navigate(request.returnTo, { replace: true });
    };
    run();
  }, [navigate, params]);

  return <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: '2rem', textAlign: 'center' }}>
    <div><PlotLogo style={{ fontSize: '2rem' }} /><p>{error || IMPORT_VIEW.tmdbConnecting}</p>{error && <a href={back.href}>{CONNECT_BACK_LABELS[back.place]}</a>}</div>
  </div>;
}
