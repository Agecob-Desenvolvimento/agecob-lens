import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { initAnalytics, initSentry } from "@/services/analytics";

initSentry();
initAnalytics();

createRoot(document.getElementById("root")!).render(<App />);
