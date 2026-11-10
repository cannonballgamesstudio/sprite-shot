import { create } from 'zustand';

type MenuActionsState = {
  onOpen?: (action?: string) => void;
  setOnOpen: (cb: (action?: string) => void) => void;
  triggerOpen: (action?: string) => void;
};

export const useMenuActions = create<MenuActionsState>((set, get) => ({
  onOpen: undefined,
  setOnOpen: (cb) => set({ onOpen: cb }),
  triggerOpen: (action?: string) => {
    const cb = get().onOpen;
    if (cb) cb(action);
  },
}));