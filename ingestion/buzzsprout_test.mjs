// Buzzsprout API smoke test: creates a PRIVATE test episode (or reuses one passed as argv[2]),
// uploads a 2s silent WAV via the uploads flow, sets a far-future publish date, verifies,
// then returns the episode to private. The API has no delete endpoint — delete it in the UI.
// Usage: node ingestion/buzzsprout_test.mjs [episodeId]   (reads buzzsprout from api_config.json)
import { readFileSync } from 'node:fs';

const cfg = JSON.parse(readFileSync(new URL('../api_config.json', import.meta.url), 'utf8')).buzzsprout;
const base = `https://www.buzzsprout.com/api/${cfg.podcast_id}`;
const headers = {
  Authorization: `Token token=${cfg.api_token}`,
  'User-Agent': 'SocialDash (msoferm@gmail.com)',
  'Content-Type': 'application/json; charset=utf-8',
  Accept: 'application/json',
};

async function api(method, path, body) {
  const r = await fetch(base + path, { method, headers, body: body && JSON.stringify(body) });
  const text = await r.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text.slice(0, 200); }
  console.log(method, path, r.status);
  if (!r.ok) throw new Error(`${method} ${path} -> ${r.status}: ${JSON.stringify(data)}`);
  return data;
}

function silentWav(seconds = 2, rate = 8000) {
  const n = rate * seconds, b = Buffer.alloc(44 + n);
  b.write('RIFF', 0); b.writeUInt32LE(36 + n, 4); b.write('WAVEfmt ', 8);
  b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22);
  b.writeUInt32LE(rate, 24); b.writeUInt32LE(rate, 28); b.writeUInt16LE(1, 32);
  b.writeUInt16LE(8, 34); b.write('data', 36); b.writeUInt32LE(n, 40); b.fill(128, 44);
  return b;
}

let episodeId = process.argv[2];
try {
  if (!episodeId) {
    const ep = await api('POST', '/episodes', {
      title: 'בדיקת API - למחיקה',
      description: '<p>תיאור בדיקה בעברית</p>',
      private: true,
    });
    episodeId = ep.id;
  }

  const file = silentWav();
  const { upload } = await api('POST', `/episodes/${episodeId}/uploads`, {
    filename: 'test.wav', byte_size: file.length, type: 'audio/wav',
  });
  const put = await fetch(upload.upload_url, {
    method: 'PUT',
    headers: { 'Content-Length': String(file.length) },
    body: file,
  });
  console.log('PUT file', put.status);
  if (!put.ok) throw new Error(await put.text());
  await api('POST', `/episodes/${episodeId}/uploads/${encodeURIComponent(upload.id)}/complete`);

  // Encoding is async: poll until duration is no longer -1.
  let g;
  for (let i = 0; i < 24; i++) {
    await new Promise((r) => setTimeout(r, 5000));
    g = await api('GET', `/episodes/${episodeId}`);
    if (g.duration !== -1) break;
  }

  await api('PUT', `/episodes/${episodeId}`, { private: false, published_at: '2027-06-01T09:00:00+03:00' });
  g = await api('GET', `/episodes/${episodeId}`);
  console.log({
    title: g.title, description: g.description, published_at: g.published_at,
    private: g.private, duration: g.duration, audio_url: g.audio_url,
  });
} finally {
  if (episodeId) {
    await api('PUT', `/episodes/${episodeId}`, { private: true })
      .then(() => console.log(`Episode ${episodeId} set back to private — delete it in the Buzzsprout UI.`))
      .catch((e) => console.error('Re-privatize failed:', e.message));
  }
}
