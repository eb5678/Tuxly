export interface ShortcutAction {
  id: string;
  name: string;
  description: string;
  defaultKey: string;
}

export interface ShortcutBinding {
  action: string;
  key: string;
  enabled: boolean;
}

export interface ShortcutsConfig {
  bindings: Record<string, ShortcutBinding>;
}

export interface ShortcutConflict {
  key: string;
  actions: string[];
}