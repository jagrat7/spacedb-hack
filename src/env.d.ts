/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_DISABLE_AUTH?: string
  readonly VITE_SPACETIMEDB_HOST?: string
  readonly VITE_SPACETIMEDB_DB_NAME?: string
  readonly VITE_SPACETIMEAUTH_AUTHORITY?: string
  readonly VITE_SPACETIMEAUTH_CLIENT_ID?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
