export const TAB_STRIP_HEIGHT = 44;
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
}

export type BrowserAction =
  | { type: 'new' }
  | { type: 'select' | 'close'; id: number };

export interface BrowserAPI {
  act(action: BrowserAction): void;
  onState(listener: (state: BrowserState) => void): () => void;
  ready(): void;
}

declare global {
  interface Window {
    browser: BrowserAPI;
  }
}
