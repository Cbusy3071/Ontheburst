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
    '<div class="auth-foot">© ' + new Date().getFullYear() + ' On the Burst · <a href="#/guidelines" data-guidelines style="text-decoration:underline">Community guidelines</a></div></div>';
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

export function showSignIn(notice) {
  shell('<h1>Sign in</h1><p class="sub2">Welcome back.</p>' +
    (notice ? '<div class="note" style="margin-bottom:14px">' + esc(notice) + '</div>' : '') +
    '<form class="form" id="authForm"><label class="field"><span>Email</span><input class="in" type="email" name="email" autocomplete="email" required></label>' +
    '<label class="field"><span>Password</span><input class="in" type="password" name="password" autocomplete="current-password" required></label>' +
    '<div class="err" id="authErr" hidden></div><button class="btn btn-p btn-block" type="submit">Sign in</button></form>' +
    '<div class="auth-alt"><button class="linkbtn" data-auth="forgot">Forgot your password?</button></div>' +
    '<div class="auth-alt">New here? <button class="linkbtn" data-auth="signup">Create an account</button></div>');
  bindForm(async (fd) => {
    const { error } = await sb.auth.signInWithPassword({ email: fd.get('email').trim(), password: fd.get('password') });
    if (error) throw error;
  });
}

export function showSignUp() {
  shell('<h1>Join On the Burst</h1><p class="sub2">Players 16 and over, parents, clubs, scouts and coaches.</p>' +
    '<form class="form" id="authForm"><label class="field"><span>Email</span><input class="in" type="email" name="email" autocomplete="email" required></label>' +
    '<label class="field"><span>Password</span><input class="in" type="password" name="password" autocomplete="new-password" minlength="8" required><small>At least 8 characters</small></label>' +
    '<label class="check"><input type="checkbox" name="agree" required><span>I\'m 16 or older and I agree to the <a class="linkbtn" href="#/guidelines" data-guidelines>community guidelines</a>. Under 16? A parent or guardian signs up and creates a Rising Star profile for you.</span></label>' +
    '<div class="err" id="authErr" hidden></div><button class="btn btn-p btn-block" type="submit">Create account</button></form>' +
    '<div class="auth-alt">Already have an account? <button class="linkbtn" data-auth="signin">Sign in</button></div>');
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
