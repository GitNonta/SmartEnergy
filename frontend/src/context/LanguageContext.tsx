import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';

// Import translations
import en from '../translations/en.json';
import th from '../translations/th.json';
import zh from '../translations/zh.json';

export type Language = 'en' | 'th' | 'zh';

type TranslationData = typeof en;

const translations: Record<Language, TranslationData> = {
    en,
    th,
    zh
};

export const LANGUAGES: { code: Language; name: string; flag: string }[] = [
    { code: 'en', name: 'English', flag: '🇬🇧' },
    { code: 'th', name: 'ไทย', flag: '🇹🇭' },
    { code: 'zh', name: '中文', flag: '🇨🇳' }
];

interface LanguageContextType {
    language: Language;
    setLanguage: (lang: Language) => void;
    t: (key: string) => string;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

// Get nested translation value by key path (e.g., "nav.dashboard")
function getNestedValue(obj: any, path: string): string {
    const keys = path.split('.');
    let value = obj;

    for (const key of keys) {
        if (value && typeof value === 'object' && key in value) {
            value = value[key];
        } else {
            return path; // Return key if not found
        }
    }

    return typeof value === 'string' ? value : path;
}

interface LanguageProviderProps {
    children: ReactNode;
    defaultLanguage?: Language;
}

export const LanguageProvider: React.FC<LanguageProviderProps> = ({
    children,
    defaultLanguage = 'en'
}) => {
    // Get initial language from localStorage or default
    const [language, setLanguageState] = useState<Language>(() => {
        if (typeof window !== 'undefined') {
            const saved = localStorage.getItem('language') as Language;
            if (saved && Object.keys(translations).includes(saved)) {
                return saved;
            }
        }
        return defaultLanguage;
    });

    // Set language and save to localStorage
    const setLanguage = useCallback((lang: Language) => {
        setLanguageState(lang);
        if (typeof window !== 'undefined') {
            localStorage.setItem('language', lang);
        }
    }, []);

    // Translation function
    const t = useCallback((key: string): string => {
        return getNestedValue(translations[language], key);
    }, [language]);

    return (
        <LanguageContext.Provider value={{ language, setLanguage, t }}>
            {children}
        </LanguageContext.Provider>
    );
};

// Hook to use language context
export function useLanguage(): LanguageContextType {
    const context = useContext(LanguageContext);
    if (!context) {
        throw new Error('useLanguage must be used within a LanguageProvider');
    }
    return context;
}

export default LanguageContext;
