import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import { lazy, Suspense } from "react";
import { App, Chats, ViewChat } from "@/pages";
import { DashboardLayout } from "@/layouts";

const SystemPrompts = lazy(() => import("@/pages/system-prompts"));
const DevSpace = lazy(() => import("@/pages/dev"));
const Shortcuts = lazy(() => import("@/pages/shortcuts"));
const Audio = lazy(() => import("@/pages/audio"));

export default function AppRoutes() {
  return (
    <Router>
      <Suspense fallback={null}>
        <Routes>
          <Route path="/" element={<App />} />
          <Route element={<DashboardLayout />}>
            {/* Essential routes stay mostly synchronous to prevent flicker */}
            <Route path="/chats" element={<Chats />} />
            <Route path="/chats/view/:conversationId" element={<ViewChat />} />
            
            <Route path="/system-prompts" element={<SystemPrompts />} />
            <Route path="/shortcuts" element={<Shortcuts />} />
            <Route path="/audio" element={<Audio />} />
            <Route path="/dev-space" element={<DevSpace />} />
            <Route path="*" element={<Navigate to="/chats" replace />} />
          </Route>
        </Routes>
      </Suspense>
    </Router>
  );
}