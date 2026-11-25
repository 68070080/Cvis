/**
 * The UI still calls `api('/api/...')`, but every call is answered from
 * IndexedDB in this browser. No server is needed, so the build is static.
 */
export { api, jsonRequest } from './localapi'
