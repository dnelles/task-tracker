export default async function handler(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const uid = url.searchParams.get('uid');
  if (!uid) {
    res.status(400).send('Missing uid');
    return;
  }
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID,
    redirect_uri: `${url.origin}/api/google/callback`,
    response_type: 'code',
    scope: 'https://www.googleapis.com/auth/tasks',
    access_type: 'offline',          // ← refresh token
    prompt: 'consent',               // ← ensure refresh_token is returned
    include_granted_scopes: 'true',
    state: uid,
  });
  res.status(302).setHeader('Location', `https://accounts.google.com/o/oauth2/v2/auth?${params}`);
  res.end();
}