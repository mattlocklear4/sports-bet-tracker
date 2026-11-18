// Supabase authentication preview. No bets are uploaded by this module.
const SUPABASE_URL = 'https://uslgixwhcsgxljejscqq.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_bLck1oTt4LEJTBji731siw_ni3JQDgE';
const authClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: { autoRefreshToken: true, persistSession: true, detectSessionInUrl: true }
});
const authStatus = document.getElementById('auth-status');
const authEmail = document.getElementById('auth-email');
const authSend = document.getElementById('auth-send');
const authLogout = document.getElementById('auth-logout');
const authMessage = document.getElementById('auth-message');
async function refreshAuth() {
  const { data: { user }, error } = await authClient.auth.getUser();
  if (error && !/session missing/i.test(error.message)) authMessage.textContent = error.message;
  authStatus.textContent = user ? 'Signed in: ' + user.email : 'Not signed in';
  authEmail.hidden = !!user;
  authSend.hidden = !!user;
  authLogout.hidden = !user;
}
authSend.addEventListener('click', async () => {
  const email = authEmail.value.trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { authMessage.textContent = 'Enter a valid email address.'; return; }
  authSend.disabled = true;
  authMessage.textContent = 'Sending sign-in link…';
  try {
    const { error } = await authClient.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: location.origin + location.pathname }
    });
    authMessage.textContent = error ? error.message : 'Check your email for the sign-in link.';
  } catch (err) { authMessage.textContent = err.message; }
  finally { authSend.disabled = false; }
});
authLogout.addEventListener('click', async () => {
  const { error } = await authClient.auth.signOut();
  authMessage.textContent = error ? error.message : 'Signed out.';
  await refreshAuth();
});
authClient.auth.onAuthStateChange(() => { void refreshAuth(); });
void refreshAuth();
