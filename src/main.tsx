import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";
import { App } from "./App";
import "./index.css";

// GitHub Pages SPA redirect: restore path from ?p= query param
const params = new URLSearchParams(window.location.search);
const redirectPath = params.get("p");
if (redirectPath) {
  params.delete("p");
  const remaining = params.toString();
  const newUrl =
    import.meta.env.BASE_URL +
    redirectPath.replace(/^\//, "") +
    (remaining ? `?${remaining}` : "") +
    window.location.hash;
  window.history.replaceState(null, "", newUrl);
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <App />
    </BrowserRouter>
  </StrictMode>,
);
