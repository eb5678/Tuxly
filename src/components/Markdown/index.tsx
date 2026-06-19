import React, { memo, useMemo } from "react";
import { Streamdown } from "streamdown";
import "katex/dist/katex.min.css";
import { openUrl } from "@tauri-apps/plugin-opener";

interface MarkdownRendererProps {
  children: string;
  isStreaming?: boolean;
}

const SHIKI_THEME = ["github-light", "github-dark"] as const;

const COMPONENTS = {
  a: ({ children, href, ...props }: any) => {
    const handleClick = async (e: React.MouseEvent) => {
      e.preventDefault();
      if (href) {
        try {
          await openUrl(href);
        } catch (error) {
          console.error("Failed to open URL:", error);
        }
      }
    };

    return (
      <a
        href={href}
        className="text-blue-500 hover:text-blue-400 font-medium underline cursor-pointer"
        onClick={handleClick}
        {...props}
      >
        {children}
      </a>
    );
  },
};

export const Markdown = memo(function Markdown({
  children,
  isStreaming = false,
}: MarkdownRendererProps) {
  
  const controls = useMemo(
    () => ({
      table: !isStreaming,
      code: !isStreaming,
      mermaid: {
        download: !isStreaming,
        copy: true,
        fullscreen: !isStreaming,
        panZoom: !isStreaming,
      },
    }),
    [isStreaming]
  );

  return (
    <Streamdown
      isAnimating={isStreaming}
      shikiTheme={SHIKI_THEME as any}
      components={COMPONENTS as any}
      controls={controls}
    >
      {children}
    </Streamdown>
  );
});