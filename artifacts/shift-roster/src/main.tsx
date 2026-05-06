import { createRoot } from "react-dom/client";
import { setBaseUrl } from "@workspace/api-client-react";
import App from "./App";
import "./index.css";
import { apiBaseUrl, installApiRequestShims } from "@/lib/api-base";

installApiRequestShims();
setBaseUrl(apiBaseUrl || null);

createRoot(document.getElementById("root")!).render(<App />);
