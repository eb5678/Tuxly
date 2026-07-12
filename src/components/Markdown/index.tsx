import React, { memo, useMemo, Component, ErrorInfo, ReactNode } from "react";
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

interface ErrorBoundaryProps { children: ReactNode; }
interface ErrorBoundaryState { hasError: boolean; error: Error | null; }

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }
  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Markdown render error:", error, errorInfo);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="p-3 bg-destructive/10 text-destructive border border-destructive/20 rounded-md text-xs font-mono break-words">
           [Render Error]: The AI returned malformed standard tags or math blocks causing a render failure. <br/><br/>
           Raw Error: {this.state.error?.message}
        </div>
      );
    }
    return this.props.children;
  }
}

export const Markdown = memo(function Markdown({
  children,
  isStreaming = false,
}: MarkdownRendererProps) {
  
  const controls = useMemo(
    () => ({
      table: true,
      code: true,
      mermaid: {
        enabled: true,
        copy: true,
        fullscreen: true,
        panZoom: true,
        theme: "dark",
      },
    }),
    []
  );

  return (
    <ErrorBoundary>
      <Streamdown
        isAnimating={isStreaming}
        shikiTheme={SHIKI_THEME as any}
        components={COMPONENTS as any}
        controls={controls}
      >
        {children}
      </Streamdown>
    </ErrorBoundary>
  );
});