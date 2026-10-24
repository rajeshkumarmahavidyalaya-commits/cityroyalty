// Vercel Function entry: the Express app, pre-bundled by `npm run build` (tsup) into dist/vercel.js.
// If the app cannot boot (bad config), answer 503 with the reason instead of an opaque crash.
let handler;
try {
  handler = (await import('../dist/vercel.js')).default;
} catch (err) {
  console.error('API failed to boot', err);
  const reason = String(err?.message ?? err).slice(0, 300);
  handler = (_req, res) => {
    res.statusCode = 503;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ error: { code: 'boot_failed', message: reason } }));
  };
}
export default handler;
