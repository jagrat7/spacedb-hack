// Server-side SpacetimeDB client. Used by the match orchestrator server
// function to write match results back into the database via reducers. We talk
// to the SpacetimeDB REST API directly (no long-lived websocket needed).
//
// Auth: reducers here are orchestrator-trusted and take participant identities
// as arguments, so any valid token works. If SPACETIMEDB_TOKEN is not provided
// we request a fresh anonymous identity/token from the server once and cache it.

const HOST = (process.env.SPACETIMEDB_HOST ?? 'http://127.0.0.1:3000').replace(
  /\/$/,
  ''
);
const DB_NAME = process.env.SPACETIMEDB_DB_NAME ?? '1stdb';

let tokenPromise: Promise<string> | null = null;

async function getToken(): Promise<string> {
  const fromEnv = process.env.SPACETIMEDB_TOKEN;
  if (fromEnv) return fromEnv;
  if (!tokenPromise) {
    tokenPromise = (async () => {
      const res = await fetch(`${HOST}/v1/identity`, { method: 'POST' });
      if (!res.ok) {
        throw new Error(
          `Failed to obtain SpacetimeDB token: ${res.status} ${await res.text()}`
        );
      }
      const data = (await res.json()) as { token: string };
      return data.token;
    })();
  }
  return tokenPromise;
}

/** Call a reducer by its snake_case name with positional JSON args. */
export async function callReducer(
  reducerName: string,
  args: unknown[]
): Promise<void> {
  const token = await getToken();
  const res = await fetch(`${HOST}/v1/database/${DB_NAME}/call/${reducerName}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(args),
  });
  if (!res.ok) {
    throw new Error(
      `Reducer ${reducerName} failed: ${res.status} ${await res.text()}`
    );
  }
}

/** Run a read-only SQL query and return the raw row arrays. */
export async function querySql(
  sql: string
): Promise<Array<{ rows: unknown[][] }>> {
  const token = await getToken();
  const res = await fetch(`${HOST}/v1/database/${DB_NAME}/sql`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'text/plain',
    },
    body: sql,
  });
  if (!res.ok) {
    throw new Error(`SQL query failed: ${res.status} ${await res.text()}`);
  }
  return (await res.json()) as Array<{ rows: unknown[][] }>;
}
