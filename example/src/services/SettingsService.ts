import * as RNFS from '@dr.pogodin/react-native-fs';

const SETTINGS_FILE = `${RNFS.DocumentDirectoryPath}/settings.json`;

export interface AppSettings {
  cloudProvider: string;
  cloudModel: string;
  cloudApiKey: string;
  cloudBaseUrl: string;
  allowCloud: boolean;
}

const DEFAULT_SETTINGS: AppSettings = {
  cloudProvider: 'gemini',
  cloudModel: 'gemini-2.0-flash',
  cloudApiKey: '',
  cloudBaseUrl: 'https://dspy-proxy.onrender.com',
  allowCloud: false,
};

export const SettingsService = {
  async loadSettings(): Promise<AppSettings> {
    try {
      const exists = await RNFS.exists(SETTINGS_FILE);
      if (!exists) {
        return DEFAULT_SETTINGS;
      }
      const content = await RNFS.readFile(SETTINGS_FILE, 'utf8');
      return { ...DEFAULT_SETTINGS, ...JSON.parse(content) };
    } catch (error) {
      console.warn('[Settings] Failed to load settings:', error);
      return DEFAULT_SETTINGS;
    }
  },

  async saveSettings(settings: AppSettings): Promise<void> {
    try {
      await RNFS.writeFile(SETTINGS_FILE, JSON.stringify(settings), 'utf8');
    } catch (error) {
      console.error('[Settings] Failed to save settings:', error);
    }
  },
};
