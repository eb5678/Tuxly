import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import {
  App, SystemPrompts, ViewChat, DevSpace, 
  Shortcuts, Audio, Chats
} from "@/pages";
import { DashboardLayout } from "@/layouts";

export default function AppRoutes() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<App />} />
        <Route element={<DashboardLayout />}>
          <Route path="/chats" element={<Chats />} />
          <Route path="/system-prompts" element={<SystemPrompts />} />
          <Route path="/chats/view/:conversationId" element={<ViewChat />} />
          <Route path="/shortcuts" element={<Shortcuts />} />
          <Route path="/audio" element={<Audio />} />
          <Route path="/dev-space" element={<DevSpace />} />
          <Route path="*" element={<Navigate to="/chats" replace />} />
        </Route>
      </Routes>
    </Router>
  );
}