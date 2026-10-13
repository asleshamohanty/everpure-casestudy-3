import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
// Fonts are bundled with the app (no call to Google at runtime).
// Everpure's site uses its licensed "Pure Sans"; Inter and Space Mono are the open fonts it also loads.
import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "@fontsource/inter/700.css";
import "@fontsource/space-mono/400.css";
import "@fontsource/space-mono/700.css";
import "./index.css";
import App from "./App.jsx";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <App />
  </StrictMode>
);
