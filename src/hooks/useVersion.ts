import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";

export const useVersion = () => {
  const [version, setVersion] = useState<string>("");
  const [isLoading, setIsLoading] = useState<boolean>(true);

  useEffect(() => {
    const fetchVersion = async () => {
      try {
        setIsLoading(true);
        const appVersion = await invoke<string>("get_app_version");
        setVersion(appVersion);
      } catch (err) {
        console.error("Failed to fetch version:", err);
        setVersion("Unknown");
      } finally {
        setIsLoading(false);
      }
    };

    fetchVersion();
  }, []);

  return { version, isLoading };
};