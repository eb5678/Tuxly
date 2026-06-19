import { SparklesIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLocation, useNavigate } from "react-router-dom";
import { useMenuItems, useVersion } from "@/hooks";

export const Sidebar = () => {
  const { version, isLoading } = useVersion();
  const { menu } = useMenuItems();
  const navigate = useNavigate();
  const activeRoute = useLocation().pathname;

  return (
    <aside className="flex w-56 flex-col select-none pt-2 border-r border-border/40 bg-sidebar">
      {/* Logo */}
      <div
        onClick={() => navigate("/dashboard")}
        className="flex h-16 items-center px-4 pt-10 gap-2 cursor-pointer hover:opacity-80 transition-opacity"
      >
        <div className="flex size-6 lg:size-7 items-center justify-center rounded-lg bg-primary shrink-0">
          <SparklesIcon className="size-4 lg:size-5 text-primary-foreground" />
        </div>
        <div className="flex flex-col">
          <h1 className="text-xs lg:text-md font-semibold text-sidebar-foreground">
            Pluely
          </h1>
          <span className="text-[8px] lg:text-[10px] text-muted-foreground -mt-1 block">
            {isLoading ? "Loading..." : `(v${version})`}
          </span>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1 px-3 py-6">
        {menu.map((item, index) => (
          <button
            onClick={() => navigate(item.href)}
            key={`${item.label}-${index}`}
            className={cn(
              "flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-xs lg:text-sm text-sidebar-foreground/70 transition-colors duration-200 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
              activeRoute.includes(item.href)
                ? "font-medium bg-sidebar-accent text-sidebar-accent-foreground"
                : ""
            )}
          >
            <div className="flex items-center gap-3">
              <item.icon className="size-4 shrink-0 transition-colors duration-200" />
              {item.label}
            </div>
            {item.count ? (
              <span className="flex size-5 items-center justify-center rounded-md bg-muted text-xs font-semibold text-muted-foreground">
                {item.count}
              </span>
            ) : null}
          </button>
        ))}
      </nav>
    </aside>
  );
};