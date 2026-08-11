import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./design-system.css";
import "./styles.css";
import "./calendar-m3.css";
import "./milestone3-v2.css";
import "./theme-v2.css";
import "./meals.css";
import "./dashboard-widgets.css";
import "./dashboard-polish.css";
import "./family-tools.css";
import "./feedback.css";
import "./mobile-family-hub.css";
import "./brand-icons.css";
import "./dark-mode.css";
import "./mobile-layout-fixes.css";
import "./admin-polish-v2.css";
import "./profile-menu-polish.css";
import "./stability-consolidated.css";
import "./stability-pass-2.css";

const storedAppearance = localStorage.getItem("kit-hub-appearance");
const appearance = storedAppearance === "light" || storedAppearance === "dark" || storedAppearance === "system" ? storedAppearance : "system";
const dark = appearance === "dark" || (appearance === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
document.documentElement.dataset.kitAppearance = dark ? "dark" : "light";
document.documentElement.style.colorScheme = dark ? "dark" : "light";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
