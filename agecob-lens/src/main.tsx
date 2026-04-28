import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { initAnalytics } from "@/services/analytics";

initAnalytics();

createRoot(document.getElementById("root")!).render(<App />);
