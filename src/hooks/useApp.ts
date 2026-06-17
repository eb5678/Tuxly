import { useEffect, useRef } from "react";
import { useTitles } from "@/hooks";
import { safeLocalStorage, migrateLocalStorageToSQLite } from "@/lib";
import { getShortcutsConfig } from "@/lib/storage";
import { invoke } from "@tauri-apps/api/core";

export const useApp = () => {
  // Track initialization to prevent terminal spam in Strict Mode
  const shortcutsInitialized = useRef(false);
  const migrationInitialized = useRef(false);
  
  useTitles();

  // Initialize shortcuts cleanly 
  useEffect(() => {
    if (shortcutsInitialized.current) return;
    shortcutsInitialized.current = true;

    const initializeShortcuts = async () => {
      try {
        const config = getShortcutsConfig();
        await invoke("update_shortcuts", { config });
      } catch (error) {
        console.error("Failed to initialize shortcuts:", error);
      }
    };

    initializeShortcuts();
  }, []);

  // Migrate localStorage chat history cleanly
  useEffect(() => {
    if (migrationInitialized.current) return;
    migrationInitialized.current = true;

    const runMigration = async () => {
      try {
        const migrationKey = "chat_history_migrated_to_sqlite";
        const alreadyMigrated = safeLocalStorage.getItem(migrationKey) === "true";

        if (alreadyMigrated) return;

        const result = await migrateLocalStorageToSQLite();

        if (result.success) {
          if (result.migratedCount > 0) {
            console.log(`Successfully migrated ${result.migratedCount} conversations to SQLite`);
          }
        } else if (result.error) {
          console.error("Migration error:", result.error);
        }
      } catch (error) {
        console.error("Critical migration failure:", error);
      }
    };
    runMigration();
  }, []);

  useEffect(() => {
    const handleShortcutRegistrationError = (
      event: Event | CustomEvent<Array<[string, string, string]>>
    ) => {
      const detail = (event as CustomEvent<Array<[string, string, string]>>)?.detail ?? [];
      if (!detail.length) return;

      const formatted = detail
        .map(([action, key, error]) => ({ action, key, error }))
        .filter(({ action, key }) => action && key);

      if (!formatted.length) return;

      console.warn("Some shortcuts could not be registered:", formatted);
    };

    window.addEventListener("shortcutRegistrationError", handleShortcutRegistrationError as EventListener);
    return () => {
      window.removeEventListener("shortcutRegistrationError", handleShortcutRegistrationError as EventListener);
    };
  }, []);
};