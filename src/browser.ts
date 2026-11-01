export const TOOLBAR_HEIGHT = 92;
export const HOME_URL = 'https://www.bilibili.com/';

export interface TabState {
  id: number;
  title: string;
  url: string;
  loading: boolean;
  audible: boolean;
  error: string;
}

export interface BrowserState {
  tabs: TabState[];
  activeId: number;
  canGoBack: boolean;
  canGoForward: boolean;
  marginOpen: boolean;
}

export type BrowserAction =
  | { type: 'new' | 'back' | 'forward' | 'reload' | 'home' | 'margin' }
  | { type: 'select' | 'close'; id: number }
  | { type: 'navigate'; value: string };

export interface BrowserAPI {
  act(action: BrowserAction): void;
  onState(listener: (state: BrowserState) => void): () => void;
  onFocusAddress(listener: () => void): () => void;
  ready(): void;
}

declare global {
  interface Window {
    browser: BrowserAPI;
  }
}
