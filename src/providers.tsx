import { QueryClient } from '@tanstack/react-query';
import { Identity } from 'spacetimedb';
import { useEffect, useMemo, useState } from 'react';
import {
  AuthProvider,
  useAuth,
  type AuthProviderProps,
} from 'react-oidc-context';
import {
  SpacetimeDBQueryClient,
  SpacetimeDBProvider,
} from 'spacetimedb/tanstack';
import { DbConnection, ErrorContext } from './module_bindings';
import { Button } from './components/ui/button';

const HOST =
  import.meta.env.VITE_SPACETIMEDB_HOST ?? 'wss://maincloud.spacetimedb.com';
const DB_NAME = import.meta.env.VITE_SPACETIMEDB_DB_NAME ?? 'overlap';

// ── SpacetimeAuth (OIDC) ──────────────────────────────────────────────────
// SpacetimeAuth is a hosted OIDC provider; react-oidc-context drives the login
// redirect and hands us a JWT (id_token) that we pass to the SpacetimeDB
// connection via .withToken(). The client_id comes from the maincloud
// dashboard (SpacetimeAuth -> Clients) and is supplied via env.

const AUTHORITY =
  import.meta.env.VITE_SPACETIMEAUTH_AUTHORITY ??
  'https://auth.spacetimedb.com/oidc';
const CLIENT_ID = import.meta.env.VITE_SPACETIMEAUTH_CLIENT_ID ?? '';

const oidcConfig: AuthProviderProps = {
  authority: AUTHORITY,
  client_id: CLIENT_ID,
  redirect_uri: typeof window !== 'undefined' ? `${window.location.origin}/` : '',
  post_logout_redirect_uri:
    typeof window !== 'undefined' ? window.location.origin : '',
  scope: 'openid profile email',
  response_type: 'code',
  automaticSilentRenew: true,
  // Strip the ?code=…&state=… off the URL after a successful login.
  onSigninCallback: () => {
    window.history.replaceState({}, document.title, window.location.pathname);
  },
};

// ── SpacetimeDB query client (shared, module-scoped) ────────────────────────

export const spacetimeDBQueryClient = new SpacetimeDBQueryClient();

export const queryClient: QueryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: spacetimeDBQueryClient.queryFn,
      staleTime: Infinity,
      refetchOnWindowFocus: false,
      refetchOnMount: false,
      refetchOnReconnect: false,
    },
  },
});
spacetimeDBQueryClient.connect(queryClient);

const onConnect = (conn: DbConnection, identity: Identity, _token: string) => {
  console.log('Connected to SpacetimeDB as', identity.toHexString());
  spacetimeDBQueryClient.setConnection(conn);
};
const onDisconnect = () => console.log('Disconnected from SpacetimeDB');
const onConnectError = (_ctx: ErrorContext, err: Error) =>
  console.error('Error connecting to SpacetimeDB:', err);

// ── Auth gate + connection ──────────────────────────────────────────────────

function FullScreen({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-screen place-items-center p-6 text-center">
      <div className="flex flex-col items-center gap-4 max-w-sm">{children}</div>
    </div>
  );
}

/** Builds the SpacetimeDB connection from the logged-in user's OIDC token. */
function SpacetimeWithAuth({ children }: { children: React.ReactNode }) {
  const auth = useAuth();

  const connectionBuilder = useMemo(() => {
    const token = auth.user?.id_token;
    if (!token) return null;
    return DbConnection.builder()
      .withUri(HOST)
      .withDatabaseName(DB_NAME)
      .withToken(token)
      .onConnect(onConnect)
      .onDisconnect(onDisconnect)
      .onConnectError(onConnectError);
  }, [auth.user?.id_token]);

  if (!CLIENT_ID) {
    return (
      <FullScreen>
        <h1 className="text-lg font-semibold">SpacetimeAuth not configured</h1>
        <p className="text-sm text-muted-foreground">
          Set <code className="font-mono">VITE_SPACETIMEAUTH_CLIENT_ID</code> in{' '}
          <code className="font-mono">.env</code> with the client ID from the
          maincloud dashboard (SpacetimeAuth → Clients), then restart the dev
          server.
        </p>
      </FullScreen>
    );
  }

  if (auth.isLoading) {
    return (
      <FullScreen>
        <p className="text-sm text-muted-foreground">Signing in…</p>
      </FullScreen>
    );
  }

  if (auth.error) {
    return (
      <FullScreen>
        <h1 className="text-lg font-semibold">Sign-in error</h1>
        <p className="text-sm text-destructive">{auth.error.message}</p>
        <Button onClick={() => auth.signinRedirect()}>Try again</Button>
      </FullScreen>
    );
  }

  if (!auth.isAuthenticated || !connectionBuilder) {
    return (
      <FullScreen>
        <h1 className="text-2xl font-heading font-semibold">Overlap</h1>
        <p className="text-sm text-muted-foreground">
          Sign in to send your AI agent to meet everyone at the event.
        </p>
        <Button onClick={() => auth.signinRedirect()}>
          Sign in with SpacetimeAuth
        </Button>
      </FullScreen>
    );
  }

  return (
    <SpacetimeDBProvider connectionBuilder={connectionBuilder}>
      {children}
    </SpacetimeDBProvider>
  );
}

/**
 * Mounts auth + the SpacetimeDB connection client-side only (oidc-client-ts
 * needs `window`). Crucially this lives BELOW the document shell + <Scripts/>
 * in __root, so the page always ships the client entry and can hydrate.
 */
export function Providers({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!mounted) {
    return (
      <FullScreen>
        <p className="text-sm text-muted-foreground">Loading Overlap…</p>
      </FullScreen>
    );
  }

  return (
    <AuthProvider {...oidcConfig}>
      <SpacetimeWithAuth>{children}</SpacetimeWithAuth>
    </AuthProvider>
  );
}
