import { Code, MessagesSquare, WandSparkles, AudioLinesIcon, SquareSlashIcon } from "lucide-react";

export const useMenuItems = () => {
  const menu: { icon: React.ElementType; label: string; href: string; count?: number; }[] = [
    { icon: MessagesSquare, label: "Chats", href: "/chats" },
    { icon: WandSparkles, label: "System prompts", href: "/system-prompts" },
    { icon: AudioLinesIcon, label: "Audio", href: "/audio" },
    { icon: SquareSlashIcon, label: "Cursor & Shortcuts", href: "/shortcuts" },
    { icon: Code, label: "Dev space", href: "/dev-space" },
  ];
  return { menu };
};