import { createSignal } from 'solid-js';

export type Theme = 'light' | 'dark' | 'sepia' | 'system';
export type FontFamily = 'Helvetica, sans-serif' | 'Georgia, serif' | 'Courier New, monospace';

const STORE_KEY = 'goread_settings';

export type Settings = {
    theme: Theme;
    fontSize: number;
    margin: number;
    fontFamily: string;
};

const defaultSettings: Settings = {
    theme: 'system',
    fontSize: 100,
    margin: 20,
    fontFamily: 'Literata, Georgia, serif',
};

const getStoredSettings = (): Settings => {
    try {
        const stored = localStorage.getItem(STORE_KEY);
        if (stored) {
            return { ...defaultSettings, ...JSON.parse(stored) };
        }
    } catch {
        /* ignore */
    }
    return defaultSettings;
};

export const [settings, setSettings] = createSignal<Settings>(getStoredSettings());

export const updateSettings = (newSettings: Partial<Settings>) => {
    setSettings((prev) => {
        const next = { ...prev, ...newSettings };
        localStorage.setItem(STORE_KEY, JSON.stringify(next));
        return next;
    });
};

export const THEMES = {
    light: {
        body: { color: '#000000', background: '#ffffff' },
    },
    dark: {
        body: { color: '#f0f0f0', background: '#000000' },
    },
    sepia: {
        body: { color: '#5f4b32', background: '#f6f1d1' },
    },
};

export const getThemeRules = (s: Settings) => {
    const themeRules: Record<string, Record<string, string>> = {
        body: {
            color:
                s.theme === 'dark'
                    ? '#dedede !important'
                    : s.theme === 'sepia'
                      ? '#5f4b32 !important'
                      : '#000000 !important',
            background:
                s.theme === 'dark'
                    ? '#000000 !important'
                    : s.theme === 'sepia'
                      ? '#f6f1d1 !important'
                      : '#ffffff !important',
        },
        p: {
            'font-family': s.fontFamily + ' !important',
            'line-height': '1.6 !important',
        },
        'h1, h2, h3, h4, h5, h6': {
            color: 'inherit !important',
            'font-family': s.fontFamily + ' !important',
        },
        a: {
            color: s.theme === 'dark' ? '#646cff !important' : 'inherit !important',
        },
    };

    if (s.theme === 'dark') {
        Object.assign(themeRules, {
            '*': {
                color: '#dedede !important',
                'background-color': 'transparent !important',
                'border-color': '#444 !important',
                'font-family': s.fontFamily + ' !important',
            },
            body: {
                color: '#dedede !important',
                background: '#000000 !important',
            },
        });
    } else if (s.theme === 'sepia') {
        Object.assign(themeRules, {
            '*': {
                color: '#5f4b32 !important',
                'background-color': 'transparent !important',
                'font-family': s.fontFamily + ' !important',
            },
            body: {
                color: '#5f4b32 !important',
                background: '#f6f1d1 !important',
            },
        });
    } else {
        Object.assign(themeRules, {
            '*': {
                color: '#000000 !important',
                'background-color': 'transparent !important',
                'border-color': '#ddd !important',
                'font-family': s.fontFamily + ' !important',
            },
            body: {
                color: '#000000 !important',
                background: '#ffffff !important',
            },
        });
    }
    return themeRules;
};
