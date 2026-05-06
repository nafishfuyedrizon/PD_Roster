import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { installApiRequestShims } from "@/lib/api-base";

installApiRequestShims();

createRoot(document.getElementById("root")!).render(<App />);
