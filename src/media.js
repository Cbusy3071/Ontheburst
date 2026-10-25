// Video and image handling: signed URLs for private clips, uploads with
// progress, reading clip metadata, and making poster frames and avatars.
import { sb, SUPABASE_URL, SUPABASE_ANON_KEY } from './supabase.js';

export const MAX_CLIP_SECONDS = 60;
export const MAX_CLIP_BYTES = 50 * 1024 * 1024;
const SIGN_SECONDS = 6 * 3600;

const cache = new Map(); // storage path -> { url, exp }

export async function signPaths(paths) {
  const now = Date.now();
  const need = Array.from(new Set(paths.filter(Boolean))).filter((p) => {
    const c = cache.get(p);
    return !c || c.exp - now < 15 * 60 * 1000;
  });
  for (let i = 0; i < need.length; i += 100) {
    const chunk = need.slice(i, i + 100);
    const { data, error } = await sb.storage.from('media').createSignedUrls(chunk, SIGN_SECONDS);
    if (error) { console.warn('sign failed', error); continue; }
    (data || []).forEach((d) => {
      const url = d.signedUrl || d.signedURL;
      if (url && d.path) cache.set(d.path, { url, exp: now + SIGN_SECONDS * 1000 });
    });
  }
}
export const mediaUrl = (path) => (path && cache.get(path) ? cache.get(path).url : '');
export async function signPosts(posts) {
  const paths = [];
  posts.forEach((p) => { if (p && p.kind === 'clip') { paths.push(p.media_path, p.poster_path); } });
  if (paths.length) await signPaths(paths);
}

const extOf = (file, fallback) => {
  const m = /\.([a-z0-9]{2,5})$/i.exec(file.name || '');
  return (m ? m[1] : fallback).toLowerCase();
};
export const newPath = (uid, ext) => uid + '/' + crypto.randomUUID() + '.' + ext;
export const clipExt = (file) => (file.type === 'video/quicktime' ? 'mov' : file.type === 'video/webm' ? 'webm' : extOf(file, 'mp4'));

// Raw upload so we get real progress events (supabase-js doesn't expose them).
export function uploadWithProgress(bucket, path, blob, contentType, onProgress) {
  return new Promise((resolve, reject) => {
    sb.auth.getSession().then(({ data }) => {
      const token = data.session && data.session.access_token;
      if (!token) return reject(new Error('Your session expired. Sign in again.'));
      const xhr = new XMLHttpRequest();
      xhr.open('POST', SUPABASE_URL + '/storage/v1/object/' + bucket + '/' + path.split('/').map(encodeURIComponent).join('/'));
      xhr.setRequestHeader('Authorization', 'Bearer ' + token);
      xhr.setRequestHeader('apikey', SUPABASE_ANON_KEY);
      xhr.setRequestHeader('Content-Type', contentType || blob.type || 'application/octet-stream');
      xhr.setRequestHeader('x-upsert', 'false');
      xhr.setRequestHeader('cache-control', 'max-age=31536000');
      xhr.upload.onprogress = (e) => { if (e.lengthComputable && onProgress) onProgress(e.loaded / e.total); };
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) return resolve(path);
        let msg = 'Upload failed (' + xhr.status + ')';
        try { const j = JSON.parse(xhr.responseText); msg = j.message || j.error || msg; } catch (_) { /* not json */ }
        if (xhr.status === 413 || /maximum allowed size|too large/i.test(msg)) msg = 'That file is too big. Clips can be up to 50 MB.';
        if (/mime type/i.test(msg)) msg = 'That file type isn\'t supported. Use MP4, MOV or WebM.';
        reject(new Error(msg));
      };
      xhr.onerror = () => reject(new Error('Upload failed. Check your connection and try again.'));
      xhr.send(blob);
    }, reject);
  });
}

export async function removeMedia(paths) {
  const list = paths.filter(Boolean);
  if (list.length) await sb.storage.from('media').remove(list);
}

// Load a local video file and read its size and length.
export function probeVideo(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const v = document.createElement('video');
    v.preload = 'metadata';
    v.muted = true;
    v.playsInline = true;
    v.setAttribute('playsinline', '');
    let settled = false;
    const fail = () => { if (settled) return; settled = true; reject(new Error('This browser can\'t read that video. Try an MP4 (on iPhone, set Camera > Formats to Most Compatible).')); };
    v.onloadedmetadata = () => {
      if (settled) return;
      settled = true;
      resolve({ url, el: v, duration: v.duration, width: v.videoWidth || 1080, height: v.videoHeight || 1920 });
    };
    v.onerror = fail;
    setTimeout(fail, 15000);
    v.src = url;
  });
}

// Grab a frame from a loaded video element as a JPEG poster.
export function posterFrom(v) {
  return new Promise((resolve) => {
    const t = Math.min(0.6, (v.duration || 1) / 2);
    const draw = () => {
      try {
        const w = Math.min(720, v.videoWidth || 720), h = Math.round(w * ((v.videoHeight || 1280) / (v.videoWidth || 720)));
        const c = document.createElement('canvas');
        c.width = w; c.height = h;
        c.getContext('2d').drawImage(v, 0, 0, w, h);
        c.toBlob((b) => resolve(b), 'image/jpeg', 0.82);
      } catch (_) { resolve(null); }
    };
    const done = () => { v.removeEventListener('seeked', done); setTimeout(draw, 60); };
    v.addEventListener('seeked', done);
    const p = v.play();
    const seek = () => { v.pause(); try { v.currentTime = t; } catch (_) { draw(); } };
    if (p && p.then) p.then(seek, seek); else seek();
    setTimeout(() => resolve(null), 8000);
  });
}

// Centre-crop an image to a square JPEG for avatars and club logos.
export function squareImage(file, size = 400) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const s = Math.min(img.naturalWidth, img.naturalHeight);
      const c = document.createElement('canvas');
      c.width = size; c.height = size;
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, size, size);
      ctx.drawImage(img, (img.naturalWidth - s) / 2, (img.naturalHeight - s) / 2, s, s, 0, 0, size, size);
      URL.revokeObjectURL(url);
      c.toBlob((b) => (b ? resolve(b) : reject(new Error('Couldn\'t read that image'))), 'image/jpeg', 0.86);
    };
    img.onerror = () => reject(new Error('That image couldn\'t be opened. Try a JPG or PNG.'));
    img.src = url;
  });
}

export async function uploadAvatar(uid, profileId, file) {
  const blob = await squareImage(file);
  const path = uid + '/' + profileId + '-' + Date.now() + '.jpg';
  const { error } = await sb.storage.from('avatars').upload(path, blob, { contentType: 'image/jpeg', cacheControl: '31536000', upsert: true });
  if (error) throw error;
  return sb.storage.from('avatars').getPublicUrl(path).data.publicUrl;
}

export function avatarPathFromUrl(url) {
  const m = /\/storage\/v1\/object\/public\/avatars\/(.+)$/.exec(url || '');
  return m ? decodeURIComponent(m[1]) : null;
}

// Remove everything this user uploaded (used before deleting the account).
export async function removeAllUserFiles(uid) {
  for (const bucket of ['media', 'avatars']) {
    for (let i = 0; i < 20; i++) {
      const { data, error } = await sb.storage.from(bucket).list(uid, { limit: 100 });
      if (error || !data || !data.length) break;
      const { error: rmErr } = await sb.storage.from(bucket).remove(data.map((f) => uid + '/' + f.name));
      if (rmErr) break;
    }
  }
}
