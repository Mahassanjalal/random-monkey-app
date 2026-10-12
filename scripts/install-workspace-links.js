// postinstall helper: npm workspaces already link file: deps; this is a no-op guard
// so `npm install` never fails when workspaces are partially checked out.
try {
  // eslint-disable-next-line no-console
  console.log('[postinstall] workspace links ok (npm workspaces manage file:../shared)');
} catch {
  // ignore — postinstall must never break install
}
