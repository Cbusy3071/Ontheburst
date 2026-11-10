// Sign in, sign up, password reset. Rendered full-screen over the app shell.
import { sb, redirectUrl } from '../supabase.js';
import { I, esc, errMsg, LOGO_SVG, $ } from '../ui.js';

const full = () => document.getElementById('full');

function shell(card) {
  document.body.classList.add('full');
  full().innerHTML = '<div class="auth-wrap"><div class="auth">' +
    '<div class="auth-brand">' + LOGO_SVG.replace('width="40" height="40"', 'width="56" height="56"') +
      '<span class="wm">On the <b>Burst</b></span>' +
      '<p class="lead">Get your footy in front of selectors. Highlights, trials and verified stats for rugby league players across Sydney.</p>' +
      '<ul><li><i>' + I.playSm.replace('#fff', 'currentColor') + '</i>Post highlights up to a minute long</li>' +
      '<li><i>' + I.check + '</i>Find trials and register interest in a tap</li>' +
      '<li><i>' + I.star + '</i>Rising Star profiles for under 16s, run by parents</li>' +
      '<li><i>' + I.shield + '</i>No direct messaging, by design</li></ul></div>' +
    '<div class="auth-card">' + card + '</div></div>' +
    '<div class="auth-foot">© ' + new Date().getFullYear() + ' On the Burst · <a href="#/guidelines" data-guidelines style="text-decoration:underline">Community guidelines</a> · <a href="./terms.html" style="text-decoration:underline">Terms</a> · <a href="./privacy.html" style="text-decoration:underline">Privacy</a></div></div>';
}

function bindForm(onSubmit) {
  const f = $('#authForm'), err = $('#authErr'), btn = f.querySelector('button[type=submit]');
  f.onsubmit = async (e) => {
    e.preventDefault();
    err.hidden = true;
    btn.disabled = true;
    const old = btn.textContent;
    btn.textContent = 'One sec...';
    try { await onSubmit(new FormData(f)); } catch (ex) {
      err.textContent = errMsg(ex);
      err.hidden = false;
    } finally { if (btn.isConnected) { btn.disabled = false; btn.textContent = old; } }
  };
}

// Google and Apple sign in. Both go through Supabase OAuth and come back as ?code=...,
// which detectSessionInUrl exchanges for a session. New accounts then hit the normal
// onboarding gate, so date of birth and the under-16 lockout still apply.
const G_LOGO = '<svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>';
const APPLE_LOGO = '<svg width="16" height="18" viewBox="0 0 814 1000" aria-hidden="true"><path fill="currentColor" d="M788.1 340.9c-5.8 4.5-108.2 62.2-108.2 190.5 0 148.4 130.3 200.9 134.2 202.2-.6 3.2-20.7 71.9-68.7 141.9-42.8 61.6-87.5 123.1-155.5 123.1s-85.5-39.5-164-39.5c-76.5 0-103.7 40.8-165.9 40.8s-105.6-57-155.5-127C46.7 790.7 0 663 0 541.8c0-194.4 126.4-297.5 250.8-297.5 66.1 0 121.2 43.4 162.7 43.4 39.5 0 101.1-46 176.3-46 28.5 0 130.9 2.6 198.3 99.2zm-234-181.5c31.1-36.9 53.1-88.1 53.1-139.3 0-7.1-.6-14.3-1.9-20.1-50.6 1.9-110.8 33.7-147.1 75.8-28.5 32.4-55.1 83.6-55.1 135.5 0 7.8 1.3 15.6 1.9 18.1 3.2.6 8.4 1.3 13.6 1.3 45.4 0 102.5-30.4 135.5-71.3z"/></svg>';

function oauthBlock(verb) {
  return '<div class="oauth">' +
    '<button type="button" class="btn btn-block btn-oauth btn-google" data-oauth="google">' + G_LOGO + verb + ' with Google</button>' +
    // Apple: switch to data-oauth="apple" once the provider is set up in Supabase (see README).
    '<button type="button" class="btn btn-block btn-oauth btn-apple" disabled aria-disabled="true">' + APPLE_LOGO + 'Apple sign in coming soon</button>' +
    '<div class="err" id="oauthErr" hidden></div></div>' +
    '<div class="or"><span>or use email</span></div>';
}

async function startOAuth(provider, btn) {
  const err = $('#oauthErr');
  if (err) err.hidden = true;
  document.querySelectorAll('[data-oauth]').forEach((b) => { b.disabled = true; });
  try {
    // A stale reset flag would send the returning ?code= to the new-password screen.
    localStorage.removeItem('otb.recovery');
    localStorage.setItem('otb.oauth', provider);
  } catch (_) { /* ignore */ }
  const { error } = await sb.auth.signInWithOAuth({
    provider,
    options: { redirectTo: redirectUrl(), ...(provider === 'google' ? { queryParams: { prompt: 'select_account' } } : {}) },
  });
  if (error) {
    try { localStorage.removeItem('otb.oauth'); } catch (_) { /* ignore */ }
    document.querySelectorAll('[data-oauth]').forEach((b) => { b.disabled = false; });
    if (err) { err.textContent = errMsg(error); err.hidden = false; }
  }
  // On success the browser is already leaving for Google or Apple.
}

const OAUTH_TERMS = '<p class="oauth-terms">By continuing with Google you confirm you\'re 16 or older and agree to the <a class="linkbtn" href="./terms.html" target="_blank" rel="noopener">terms</a>, <a class="linkbtn" href="./privacy.html" target="_blank" rel="noopener">privacy policy</a> and <a class="linkbtn" href="#/guidelines" data-guidelines>community guidelines</a>.</p>';

export function showSignIn(notice) {
  shell('<h1>Sign in</h1><p class="sub2">Welcome back.</p>' +
    (notice ? '<div class="note" style="margin-bottom:14px">' + esc(notice) + '</div>' : '') +
    oauthBlock('Continue') +
    '<form class="form" id="authForm"><label class="field"><span>Email</span><input class="in" type="email" name="email" autocomplete="email" required></label>' +
    '<label class="field"><span>Password</span><input class="in" type="password" name="password" autocomplete="current-password" required></label>' +
    '<div class="err" id="authErr" hidden></div><button class="btn btn-p btn-block" type="submit">Sign in</button></form>' +
    '<div class="auth-alt"><button class="linkbtn" data-auth="forgot">Forgot your password?</button></div>' +
    '<div class="auth-alt">New here? <button class="linkbtn" data-auth="signup">Create an account</button></div>' + OAUTH_TERMS);
  bindForm(async (fd) => {
    const { error } = await sb.auth.signInWithPassword({ email: fd.get('email').trim(), password: fd.get('password') });
    if (error) throw error;
  });
}

export function showSignUp() {
  shell('<h1>Join On the Burst</h1><p class="sub2">Players 16 and over, parents, clubs, scouts and coaches.</p>' +
    oauthBlock('Sign up') +
    '<form class="form" id="authForm"><label class="field"><span>Email</span><input class="in" type="email" name="email" autocomplete="email" required></label>' +
    '<label class="field"><span>Password</span><input class="in" type="password" name="password" autocomplete="new-password" minlength="8" required><small>At least 8 characters</small></label>' +
    '<label class="check"><input type="checkbox" name="agree" required><span>I\'m 16 or older and I agree to the <a class="linkbtn" href="./terms.html" target="_blank" rel="noopener">terms</a>, <a class="linkbtn" href="./privacy.html" target="_blank" rel="noopener">privacy policy</a> and <a class="linkbtn" href="#/guidelines" data-guidelines>community guidelines</a>. Under 16? A parent or guardian signs up and creates a Rising Star profile for you.</span></label>' +
    '<div class="err" id="authErr" hidden></div><button class="btn btn-p btn-block" type="submit">Create account</button></form>' +
    '<div class="auth-alt">Already have an account? <button class="linkbtn" data-auth="signin">Sign in</button></div>' + OAUTH_TERMS);
  bindForm(async (fd) => {
    if (!fd.get('agree')) throw new Error('Tick the box to continue.');
    const pw = fd.get('password');
    if (pw.length < 8) throw new Error('Use a password with at least 8 characters.');
    const email = fd.get('email').trim();
    const { data, error } = await sb.auth.signUp({ email, password: pw, options: { emailRedirectTo: redirectUrl() } });
    if (error) throw error;
    if (!data.session) showCheckEmail(email, 'confirm');
  });
}

export function showForgot() {
  shell('<h1>Reset password</h1><p class="sub2">We\'ll email you a link to set a new one.</p>' +
    '<form class="form" id="authForm"><label class="field"><span>Email</span><input class="in" type="email" name="email" autocomplete="email" required></label>' +
    '<div class="err" id="authErr" hidden></div><button class="btn btn-p btn-block" type="submit">Send reset link</button></form>' +
    '<div class="auth-alt"><button class="linkbtn" data-auth="signin">Back to sign in</button></div>');
  bindForm(async (fd) => {
    const email = fd.get('email').trim();
    const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: redirectUrl() });
    if (error) throw error;
    try { localStorage.setItem('otb.recovery', '1'); } catch (_) { /* ignore */ }
    showCheckEmail(email, 'reset');
  });
}

export function showCheckEmail(email, why) {
  shell('<h1>Check your email</h1><p class="sub2">We sent a link to <b>' + esc(email) + '</b>.</p>' +
    '<div class="note">' + (why === 'reset' ? 'Open the link to choose a new password.' : 'Open the link to confirm your email, then you\'ll set up your profile.') + ' It can take a minute, and check your spam folder.</div>' +
    '<div class="auth-alt"><button class="linkbtn" data-auth="signin">Back to sign in</button></div>');
}

export function showNewPassword(onDone) {
  shell('<h1>New password</h1><p class="sub2">Choose a new password for your account.</p>' +
    '<form class="form" id="authForm"><label class="field"><span>New password</span><input class="in" type="password" name="password" autocomplete="new-password" minlength="8" required></label>' +
    '<div class="err" id="authErr" hidden></div><button class="btn btn-p btn-block" type="submit">Save password</button></form>');
  bindForm(async (fd) => {
    const pw = fd.get('password');
    if (pw.length < 8) throw new Error('Use a password with at least 8 characters.');
    const { error } = await sb.auth.updateUser({ password: pw });
    if (error) throw error;
    try { localStorage.removeItem('otb.recovery'); } catch (_) { /* ignore */ }
    onDone();
  });
}

document.addEventListener('click', (e) => {
  const o = e.target.closest('[data-oauth]');
  if (o) { e.preventDefault(); startOAuth(o.dataset.oauth, o); return; }
  const t = e.target.closest('[data-auth]');
  if (!t) return;
  e.preventDefault();
  ({ signin: () => showSignIn(), signup: showSignUp, forgot: showForgot })[t.dataset.auth]();
});

export function showSetup() {
  document.body.classList.add('full');
  full().innerHTML = '<div class="setup"><div class="card prose"><h1>Connect Supabase</h1>' +
    '<p>The app needs your Supabase project details. Create a file called <code>.env.local</code> in the project folder with:</p>' +
    '<pre>VITE_SUPABASE_URL=https://your-project.supabase.co\nVITE_SUPABASE_ANON_KEY=your-anon-key</pre>' +
    '<p>Find both in Supabase under Project Settings &gt; API. Then restart <code>npm run dev</code>. The README walks through the rest.</p></div></div>';
}
