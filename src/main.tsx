import React from "react";
import ReactDOM from "react-dom/client";
import { AppProvider, ThemeProvider } from "./contexts";
import "./global.css";
import AppRoutes from "./routes";

document.documentElement.style.setProperty("background-color", "#000000", "important");
document.body.style.setProperty("background-color", "#000000", "important");

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <ThemeProvider>
      <AppProvider>
        <AppRoutes />
      </AppProvider>
    </ThemeProvider>
  </React.StrictMode>
);