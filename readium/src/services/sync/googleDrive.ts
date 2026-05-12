import type { RemoteFile } from "./syncProvider";

type GoogleDriveFile = {
  id: string;
  name: string;
  mimeType: string;
  parents?: string[];
  modifiedTime?: string;
  size?: string;
};

const CLIENT_ID = import.meta.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = import.meta.env.GOOGLE_CLIENT_SECRET;
const SCOPES = "https://www.googleapis.com/auth/drive.file";
const REDIRECT_PATH = "google-callback";
const ACCESS_TOKEN_KEY = "readium_google_access_token";
const REFRESH_TOKEN_KEY = "readium_google_refresh_token";
const TOKEN_EXPIRATION_KEY = "readium_google_token_expiration";
const CODE_VERIFIER_KEY = "readium_google_code_verifier";
const APP_FOLDER_ID_KEY = "readium_google_app_folder_id";
const APP_FOLDER_NAME = "readium";

let accessToken: string | null = localStorage.getItem(ACCESS_TOKEN_KEY);
let refreshToken: string | null = localStorage.getItem(REFRESH_TOKEN_KEY);
let tokenExpiration: number = Number(localStorage.getItem(TOKEN_EXPIRATION_KEY)) || 0;
let appFolderId: string | null = localStorage.getItem(APP_FOLDER_ID_KEY);

const toRemoteFile = (file: GoogleDriveFile): RemoteFile => ({
  id: file.id,
  name: file.name,
  ref: file.id,
  size: Number(file.size) || 0,
  lastModified: file.modifiedTime || new Date().toISOString(),
});

const generateCodeVerifier = (): string => {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return btoa(String.fromCharCode(...array))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
};

const generateCodeChallenge = async (verifier: string): Promise<string> => {
  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
};

export const getAuthUrl = async (): Promise<string> => {
  if (!CLIENT_ID || !CLIENT_SECRET) {
    throw new Error("Google Drive is not configured");
  }

  const baseUrl = window.location.origin;
  const redirectUri = `${baseUrl}/${REDIRECT_PATH}`;
  const codeVerifier = generateCodeVerifier();
  sessionStorage.setItem(CODE_VERIFIER_KEY, codeVerifier);

  const codeChallenge = await generateCodeChallenge(codeVerifier);

  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: SCOPES,
    access_type: "offline",
    prompt: "consent",
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
  });

  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
};

export const handleGoogleAuthCallback = async (code: string): Promise<boolean> => {
  try {
    const storedVerifier = sessionStorage.getItem(CODE_VERIFIER_KEY);
    if (!storedVerifier) {
      console.error("Missing Google code verifier");
      return false;
    }

    const baseUrl = window.location.origin;
    const redirectUri = `${baseUrl}/${REDIRECT_PATH}`;

    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        code,
        code_verifier: storedVerifier,
        grant_type: "authorization_code",
        redirect_uri: redirectUri,
      }),
    });

    if (!response.ok) {
      console.error("Google token exchange failed:", await response.json());
      return false;
    }

    const data = await response.json();
    if (!data.access_token) return false;

    setTokens(data.access_token, data.refresh_token, data.expires_in);
    sessionStorage.removeItem(CODE_VERIFIER_KEY);
    return true;
  } catch (error) {
    console.error("Error handling Google auth callback:", error);
    return false;
  }
};

const setTokens = (access: string, refresh: string | undefined, expiresInSeconds: number) => {
  accessToken = access;
  tokenExpiration = Date.now() + expiresInSeconds * 1000;
  localStorage.setItem(ACCESS_TOKEN_KEY, access);
  localStorage.setItem(TOKEN_EXPIRATION_KEY, String(tokenExpiration));

  if (refresh) {
    refreshToken = refresh;
    localStorage.setItem(REFRESH_TOKEN_KEY, refresh);
  }
};

export const refreshAccessToken = async (): Promise<boolean> => {
  if (!refreshToken) return false;

  try {
    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        refresh_token: refreshToken,
        grant_type: "refresh_token",
      }),
    });

    if (!response.ok) {
      disconnectGoogleDrive();
      return false;
    }

    const data = await response.json();
    if (!data.access_token) return false;

    setTokens(data.access_token, undefined, data.expires_in);
    return true;
  } catch (error) {
    console.error("Error refreshing Google access token:", error);
    disconnectGoogleDrive();
    return false;
  }
};

export const isGoogleDriveInitialized = (): boolean => {
  return !!refreshToken;
};

export const disconnectGoogleDrive = () => {
  accessToken = null;
  refreshToken = null;
  tokenExpiration = 0;
  appFolderId = null;
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
  localStorage.removeItem(TOKEN_EXPIRATION_KEY);
  localStorage.removeItem(APP_FOLDER_ID_KEY);
};

const fetchWithAuth = async (url: string, options: RequestInit = {}) => {
  if (!accessToken || Date.now() >= tokenExpiration) {
    const refreshed = await refreshAccessToken();
    if (!refreshed) throw new Error("Google token expired");
  }

  const headers = {
    Authorization: `Bearer ${accessToken}`,
    ...options.headers,
  };

  let response = await fetch(url, { ...options, headers });

  if (response.status === 401) {
    const refreshed = await refreshAccessToken();
    if (!refreshed) throw new Error("Unauthorized");

    response = await fetch(url, {
      ...options,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        ...options.headers,
      },
    });
  }

  if (!response.ok) {
    throw new Error(`Google Drive API Error: ${response.status} ${response.statusText}`);
  }

  return response;
};

const getAppFolderId = async (): Promise<string> => {
  if (appFolderId) return appFolderId;

  const q = `name = '${APP_FOLDER_NAME}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
  const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id)`;
  const res = await fetchWithAuth(url);
  const data = await res.json();

  if (data.files && data.files.length > 0) {
    appFolderId = data.files[0].id;
    localStorage.setItem(APP_FOLDER_ID_KEY, appFolderId!);
    return appFolderId!;
  }

  const createRes = await fetchWithAuth("https://www.googleapis.com/drive/v3/files", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name: APP_FOLDER_NAME,
      mimeType: "application/vnd.google-apps.folder",
    }),
  });

  const folder = await createRes.json();
  appFolderId = folder.id;
  localStorage.setItem(APP_FOLDER_ID_KEY, appFolderId!);
  return appFolderId!;
};

export const getFileByName = async (name: string): Promise<RemoteFile | null> => {
  const folderId = await getAppFolderId();
  const q = `'${folderId}' in parents and name = '${name}' and trashed = false`;
  const fields = "files(id, name, mimeType, modifiedTime, size)";
  const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=${encodeURIComponent(fields)}`;
  const res = await fetchWithAuth(url);
  const data = await res.json();
  const file = data.files?.[0] as GoogleDriveFile | undefined;
  return file ? toRemoteFile(file) : null;
};

const uploadFile = async (
  name: string,
  content: Blob | ArrayBuffer,
  mimeType: string,
  fileId?: string,
): Promise<RemoteFile> => {
  const folderId = await getAppFolderId();
  const blob = content instanceof Blob ? content : new Blob([content], { type: mimeType });
  const metadata: Partial<GoogleDriveFile> = {
    mimeType,
  };

  if (!fileId) {
    metadata.name = name;
    metadata.parents = [folderId];
  }

  const form = new FormData();
  form.append("metadata", new Blob([JSON.stringify(metadata)], { type: "application/json" }));
  form.append("file", blob);

  const fields = "id,name,mimeType,modifiedTime,size";
  let url = `https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=${encodeURIComponent(fields)}`;
  let method = "POST";

  if (fileId) {
    url = `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=multipart&fields=${encodeURIComponent(fields)}`;
    method = "PATCH";
  }

  const res = await fetchWithAuth(url, {
    method,
    body: form,
  });

  return toRemoteFile(await res.json());
};

export const uploadTextFile = async (name: string, content: string, ref?: string): Promise<RemoteFile> => {
  return await uploadFile(name, new Blob([content], { type: "application/json" }), "application/json", ref);
};

export const uploadBinaryFile = async (
  name: string,
  content: Blob | ArrayBuffer,
  mimeType: string,
  ref?: string,
): Promise<RemoteFile> => {
  return await uploadFile(name, content, mimeType, ref);
};

export const downloadBinaryFile = async (ref: string): Promise<ArrayBuffer> => {
  const url = `https://www.googleapis.com/drive/v3/files/${ref}?alt=media`;
  const res = await fetchWithAuth(url);
  return await res.arrayBuffer();
};

export const downloadTextFile = async (ref: string): Promise<string> => {
  const url = `https://www.googleapis.com/drive/v3/files/${ref}?alt=media`;
  const res = await fetchWithAuth(url);
  return await res.text();
};

export const deleteFile = async (ref: string): Promise<void> => {
  await fetchWithAuth(`https://www.googleapis.com/drive/v3/files/${ref}`, {
    method: "DELETE",
  });
};
