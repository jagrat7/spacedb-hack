/** Private LAN IPs — OIDC redirect URIs won't match, so skip SpacetimeAuth. */
function isPrivateNetworkHost(hostname: string): boolean {
  return (
    /^192\.168\./.test(hostname) ||
    /^10\./.test(hostname) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(hostname) ||
    hostname.endsWith('.local')
  )
}

/** Drop stale OIDC session data so react-oidc-context can't auto-redirect. */
export function clearOidcStorage() {
  if (typeof window === 'undefined') return
  for (let i = localStorage.length - 1; i >= 0; i--) {
    const key = localStorage.key(i)
    if (key?.startsWith('oidc.')) localStorage.removeItem(key)
  }
}

/**
 * Runtime auth bypass — works without a rebuild.
 * - VITE_DISABLE_AUTH=true in .env
 * - ?noauth=1 in the URL
 * - accessing via a private LAN IP (192.168.x.x, 10.x.x.x, etc.)
 */
export function isAuthDisabled(): boolean {
  if (import.meta.env.VITE_DISABLE_AUTH === 'true') return true
  if (typeof window === 'undefined') return false

  if (new URLSearchParams(window.location.search).has('noauth')) return true

  const host = window.location.hostname
  return isPrivateNetworkHost(host)
}
