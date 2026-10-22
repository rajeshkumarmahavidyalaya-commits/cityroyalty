// Upload proxy for the API's `supabase` storage driver. The API never holds the service-role key:
// it sends a shared token, and this function (which has the key) writes into the public `media` bucket.
// MEDIA_TOKEN_SHA256 (function secret, or injected into TOKEN_SHA256 at deploy) = hex SHA-256 of the API's SUPABASE_MEDIA_TOKEN.
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';

const TOKEN_SHA256 = ''; // filled in at deploy time; never the token itself
const BUCKET = 'media';
const MAX_BYTES = 10 * 1024 * 1024;
const TYPES = new Set(['image/avif', 'image/webp', 'image/jpeg', 'image/png']);
const KEY = /^images\/[A-Za-z0-9_-]{1,80}\/[A-Za-z0-9._-]{1,80}$/;

const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });

async function sha256(s: string) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
function same(a: string, b: string) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' });
  const expected = Deno.env.get('MEDIA_TOKEN_SHA256') || TOKEN_SHA256;
  const token = req.headers.get('x-upload-token') ?? '';
  if (!expected || !token || !same(await sha256(token), expected)) return json(401, { error: 'unauthorized' });
  const key = req.headers.get('x-object-key') ?? '';
  const type = (req.headers.get('content-type') ?? '').split(';')[0]!.trim();
  if (!KEY.test(key) || key.includes('..')) return json(400, { error: 'bad_key' });
  if (!TYPES.has(type)) return json(415, { error: 'unsupported_type' });
  const body = new Uint8Array(await req.arrayBuffer());
  if (!body.length || body.length > MAX_BYTES) return json(413, { error: 'bad_size' });
  // keys are content-hashed, so an existing object already has these bytes
  const { error } = await supabase.storage.from(BUCKET).upload(key, body, { contentType: type, cacheControl: '31536000', upsert: true });
  if (error) return json(502, { error: 'storage_error', message: error.message });
  return json(201, { key });
});
