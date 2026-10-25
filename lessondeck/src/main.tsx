import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { registerSW } from "virtual:pwa-register";
import App from "./App";
import "./styles.css";

registerSW({
  immediate: true,
  onOfflineReady() {
    window.dispatchEvent(new Event("lessondeck:offline-ready"));
  },
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
