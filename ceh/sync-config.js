/* Public browser configuration. Never put a service-role/secret key here.
   The hosted schema is defined in tools/ceh-sync/schema.sql. */
window.CEH_SYNC_CONFIG = Object.freeze({
  url: 'https://cbkhisehgxnuadoitono.supabase.co',
  publishableKey: 'sb_publishable_rVrFd5OJfFs5Az5kX0WKhw_lHIDBOfw',
  // Enable after configuring an email service that can deliver reset emails to all users.
  passwordResetEnabled: false
});
