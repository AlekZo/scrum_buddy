import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { initStorage } from "./lib/storage";

// Initialize volume-based storage (no-op if not in Docker)
initStorage().catch(() => {});

createRoot(document.getElementById("root")!).render(<App />);
