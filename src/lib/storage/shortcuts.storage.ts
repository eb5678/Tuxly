import { STORAGE_KEYS, DEFAULT_SHORTCUT_ACTIONS } from "@/config";
import {
  ShortcutsConfig,
  ShortcutBinding,
  ShortcutConflict,
} from "@/types";

export const getDefaultShortcutsConfig = (): ShortcutsConfig => {
  const bindings: Record<string, ShortcutBinding> = {};
  DEFAULT_SHORTCUT_ACTIONS.forEach((action) => {
    bindings[action.id] = {
      action: action.id,
      key: action.defaultKey,
      enabled: true,
    };
  });
  return { bindings };
};

export const getShortcutsConfig = (): ShortcutsConfig => {
  try {
    const stored = localStorage.getItem(STORAGE_KEYS.SHORTCUTS);
    if (stored) {
      const parsed = JSON.parse(stored);
      const defaults = getDefaultShortcutsConfig();
      return {
        bindings: { ...defaults.bindings, ...parsed.bindings },
      };
    }
    return getDefaultShortcutsConfig();
  } catch (error) {
    return getDefaultShortcutsConfig();
  }
};

export const setShortcutsConfig = (config: ShortcutsConfig): void => {
  try {
    localStorage.setItem(STORAGE_KEYS.SHORTCUTS, JSON.stringify(config));
  } catch (error) {}
};

export const updateShortcutBinding = (
  actionId: string,
  key: string,
  enabled: boolean = true
): ShortcutsConfig => {
  const config = getShortcutsConfig();
  config.bindings[actionId] = { action: actionId, key, enabled };
  setShortcutsConfig(config);
  return config;
};

export const resetShortcutsToDefaults = (): ShortcutsConfig => {
  const defaults = getDefaultShortcutsConfig();
  setShortcutsConfig(defaults);
  return defaults;
};

export const checkShortcutConflicts = (
  key: string,
  excludeActionId?: string
): ShortcutConflict | null => {
  const config = getShortcutsConfig();
  const conflicts: string[] = [];
  const normalizedNewKey = normalizeShortcutKey(key);

  Object.entries(config.bindings).forEach(([actionId, binding]) => {
    if (
      normalizeShortcutKey(binding.key) === normalizedNewKey && 
      binding.enabled &&
      actionId !== excludeActionId
    ) {
      conflicts.push(actionId);
    }
  });

  if (conflicts.length > 0) {
    return { key, actions: conflicts };
  }
  return null;
};

export const normalizeShortcutKey = (key: string): string => {
  const parts = key.toLowerCase().split("+").map(p => p.trim());
  const modifierPriority: Record<string, number> = { 
    super: 1, ctrl: 2, alt: 3, shift: 4 
  };
  return Array.from(new Set(parts))
    .sort((a, b) => {
      const aPrio = modifierPriority[a] || 99;
      const bPrio = modifierPriority[b] || 99;
      if (aPrio !== bPrio) return aPrio - bPrio;
      return a.localeCompare(b);
    })
    .join("+");
};

export const formatShortcutKeyForDisplay = (key: string): string => {
  return key
    .split("+")
    .map((part) => {
      const trimmed = part.trim();
      return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
    })
    .join(" + ");
};