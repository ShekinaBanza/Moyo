export class ApiError extends Error {
    constructor(
        public status: number,
        message: string,
        public errors: Record<string, string[]> = {},
        public body: Record<string, unknown> = {},
    ) {
        super(message);
    }
}

/** Network failure (offline, DNS, server unreachable) as opposed to an HTTP error answer. */
export class NetworkError extends Error {}

function xsrfToken(): string {
    const m = document.cookie.match(/(?:^|; )XSRF-TOKEN=([^;]*)/);
    return m ? decodeURIComponent(m[1]) : '';
}

let csrfReady = false;

async function ensureCsrf() {
    if (csrfReady && xsrfToken()) return;
    await fetch('/sanctum/csrf-cookie', { credentials: 'same-origin' });
    csrfReady = true;
}

export async function api<T = unknown>(method: string, url: string, body?: unknown): Promise<T> {
    const isWrite = method !== 'GET';
    let res: Response;
    try {
        if (isWrite) await ensureCsrf();
        res = await fetch(url, {
            method,
            credentials: 'same-origin',
            headers: {
                Accept: 'application/json',
                'X-Requested-With': 'XMLHttpRequest',
                ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
                ...(isWrite ? { 'X-XSRF-TOKEN': xsrfToken() } : {}),
            },
            body: body !== undefined ? JSON.stringify(body) : undefined,
            cache: 'no-store', // health data must never come from an HTTP cache
        });
    } catch {
        throw new NetworkError('Réseau indisponible');
    }

    if (res.status === 204) return undefined as T;
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
        const firstError = data.errors ? (Object.values(data.errors)[0] as string[])[0] : undefined;
        if (res.status === 419) csrfReady = false;
        throw new ApiError(res.status, firstError ?? data.message ?? 'Une erreur est survenue.', data.errors ?? {}, data);
    }
    return data as T;
}

export const get = <T>(url: string) => api<T>('GET', url);
export const post = <T>(url: string, body?: unknown) => api<T>('POST', url, body ?? {});
export const patch = <T>(url: string, body?: unknown) => api<T>('PATCH', url, body ?? {});
export const del = <T>(url: string, body?: unknown) => api<T>('DELETE', url, body ?? {});
export const put = <T>(url: string, body?: unknown) => api<T>('PUT', url, body ?? {});
