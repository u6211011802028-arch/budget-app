import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  Auth,
  browserLocalPersistence,
  browserPopupRedirectResolver,
  getAuth,
  GoogleAuthProvider,
  initializeAuth,
  onAuthStateChanged,
  setPersistence,
  signInWithPopup,
  User,
} from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';

export const SCOPES = [
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/drive.metadata.readonly',
];

const TOKEN_STORAGE_KEY = 'google_oauth_token_cache_v1';
const DEFAULT_TOKEN_TTL_SEC = 3600;
const EXPIRY_SAFETY_BUFFER_MS = 60 * 1000;

export interface StoredOAuthToken {
  accessToken: string;
  expiresAt: number;
  uid?: string;
  displayName?: string | null;
  email?: string | null;
}

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

let auth: Auth;
try {
  auth = initializeAuth(app, {
    persistence: browserLocalPersistence,
    popupRedirectResolver: browserPopupRedirectResolver,
  });
} catch {
  auth = getAuth(app);
  setPersistence(auth, browserLocalPersistence).catch((err) => {
    console.error('Failed to enforce browserLocalPersistence:', err);
  });
}

const provider = new GoogleAuthProvider();
SCOPES.forEach((scope) => provider.addScope(scope));
provider.setCustomParameters({
  prompt: 'select_account',
});

let isSigningIn = false;
let cachedAccessToken: string | null = null;
let cachedExpiresAt = 0;

function saveTokenToStorage(
  accessToken: string,
  expiresAt: number,
  user?: User | null
) {
  cachedAccessToken = accessToken;
  cachedExpiresAt = expiresAt;
  try {
    const payload: StoredOAuthToken = {
      accessToken,
      expiresAt,
      uid: user?.uid,
      displayName: user?.displayName ?? null,
      email: user?.email ?? null,
    };
    localStorage.setItem(TOKEN_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // ignore storage quota errors
  }
}

export function loadTokenFromStorage(expectedUid?: string): StoredOAuthToken | null {
  try {
    const raw = localStorage.getItem(TOKEN_STORAGE_KEY);
    if (!raw) return null;
    const parsed: StoredOAuthToken = JSON.parse(raw);
    if (
      !parsed ||
      typeof parsed.accessToken !== 'string' ||
      typeof parsed.expiresAt !== 'number'
    ) {
      localStorage.removeItem(TOKEN_STORAGE_KEY);
      return null;
    }
    if (Date.now() >= parsed.expiresAt) {
      localStorage.removeItem(TOKEN_STORAGE_KEY);
      return null;
    }
    if (expectedUid && parsed.uid && parsed.uid !== expectedUid) {
      localStorage.removeItem(TOKEN_STORAGE_KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function removeTokenFromStorage() {
  cachedAccessToken = null;
  cachedExpiresAt = 0;
  try {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
  } catch {
    // ignore
  }
}

// Hydrate in-memory cache immediately on module load if a non-expired token exists
const initialStored = loadTokenFromStorage();
if (initialStored) {
  cachedAccessToken = initialStored.accessToken;
  cachedExpiresAt = initialStored.expiresAt;
}

export const getStoredUserProfile = (): {
  displayName: string | null;
  email: string | null;
} | null => {
  const stored = loadTokenFromStorage();
  if (!stored) return null;
  return {
    displayName: stored.displayName ?? null,
    email: stored.email ?? null,
  };
};

export const initAuth = (
  onAuthSuccess?: (user: User, token: string) => void,
  onAuthFailure?: (user: User | null) => void
) => {
  let cancelled = false;

  const unsubscribe = onAuthStateChanged(auth, async (user: User | null) => {
    await auth.authStateReady();
    if (cancelled) return;

    const currentUser = user ?? auth.currentUser;

    if (currentUser) {
      if (cachedAccessToken && Date.now() < cachedExpiresAt) {
        onAuthSuccess?.(currentUser, cachedAccessToken);
        return;
      }

      const stored = loadTokenFromStorage(currentUser.uid);
      if (stored) {
        cachedAccessToken = stored.accessToken;
        cachedExpiresAt = stored.expiresAt;
        onAuthSuccess?.(currentUser, stored.accessToken);
        return;
      }

      if (!isSigningIn) {
        removeTokenFromStorage();
        onAuthFailure?.(currentUser);
      }
    } else if (!isSigningIn) {
      removeTokenFromStorage();
      onAuthFailure?.(null);
    }
  });

  return () => {
    cancelled = true;
    unsubscribe();
  };
};

export const googleSignIn = async (): Promise<{
  user: User;
  accessToken: string;
}> => {
  try {
    isSigningIn = true;
    await setPersistence(auth, browserLocalPersistence);
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error(
        'ไม่สามารถรับสิทธิ์เข้าถึง Google Sheets ได้ กรุณาลองใหม่อีกครั้ง'
      );
    }

    const tokenRespExpiresIn = Number(
      (result as any)?._tokenResponse?.oauthExpireIn ||
        (result as any)?._tokenResponse?.expiresIn
    );
    const ttlSeconds =
      Number.isFinite(tokenRespExpiresIn) && tokenRespExpiresIn > 120
        ? tokenRespExpiresIn
        : DEFAULT_TOKEN_TTL_SEC;

    const expiresAt =
      Date.now() + ttlSeconds * 1000 - EXPIRY_SAFETY_BUFFER_MS;

    saveTokenToStorage(credential.accessToken, expiresAt, result.user);
    return { user: result.user, accessToken: credential.accessToken };
  } finally {
    isSigningIn = false;
  }
};

export const getAccessToken = (): string | null => {
  if (cachedAccessToken && Date.now() < cachedExpiresAt) {
    return cachedAccessToken;
  }
  const stored = loadTokenFromStorage(auth.currentUser?.uid);
  if (stored) {
    cachedAccessToken = stored.accessToken;
    cachedExpiresAt = stored.expiresAt;
    return stored.accessToken;
  }
  removeTokenFromStorage();
  return null;
};

export const clearCachedToken = () => {
  removeTokenFromStorage();
};

export const logout = async (): Promise<void> => {
  await auth.signOut();
  removeTokenFromStorage();
};
