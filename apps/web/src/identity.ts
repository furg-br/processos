import { UserManager, WebStorageStateStore, type User } from "oidc-client-ts";

const authority = import.meta.env.VITE_OIDC_AUTHORITY?.trim();
const clientId = import.meta.env.VITE_OIDC_CLIENT_ID?.trim();
export const institutionalIdentityEnabled = Boolean(authority && clientId);

let manager: UserManager | undefined;

function getManager() {
  if (!institutionalIdentityEnabled) return undefined;
  manager ??= new UserManager({
    authority,
    client_id: clientId,
    redirect_uri: import.meta.env.VITE_OIDC_REDIRECT_URI || `${window.location.origin}${window.location.pathname}`,
    post_logout_redirect_uri: import.meta.env.VITE_OIDC_POST_LOGOUT_REDIRECT_URI || window.location.origin,
    response_type: "code",
    scope: import.meta.env.VITE_OIDC_SCOPE || "openid profile",
    loadUserInfo: true,
    automaticSilentRenew: true,
    userStore: new WebStorageStateStore({ store: window.sessionStorage }),
    stateStore: new WebStorageStateStore({ store: window.sessionStorage }),
  });
  return manager;
}

export async function initializeIdentity(): Promise<boolean> {
  if (window.location.pathname.startsWith("/publico/processos/")) return true;
  const oidc = getManager();
  if (!oidc) return true;
  if (new URLSearchParams(window.location.search).has("code") && new URLSearchParams(window.location.search).has("state")) {
    const user = await oidc.signinRedirectCallback();
    const state = user.state as { returnUrl?: string } | undefined;
    window.history.replaceState({}, "", state?.returnUrl ?? window.location.pathname);
  }
  const current = await oidc.getUser();
  if (current && !current.expired) return true;
  await oidc.signinRedirect({ state: { returnUrl: `${window.location.pathname}${window.location.search}${window.location.hash}` } });
  return false;
}

export async function getInstitutionalUser(): Promise<User | null> {
  return (await getManager()?.getUser()) ?? null;
}

export async function getAccessToken(): Promise<string | undefined> {
  const user = await getInstitutionalUser();
  return user && !user.expired ? user.access_token : undefined;
}

export async function signOut() {
  await getManager()?.signoutRedirect();
}
