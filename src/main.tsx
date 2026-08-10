import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles.css";
import "./calendar-m3.css";
import "./milestone3-v2.css";
import "./theme-v2.css";
import "./meals.css";
import "./dashboard-widgets.css";
import "./dashboard-polish.css";
import "./family-tools.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
