import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles.css";
import { initializePlugins } from "./plugins";
import { invoke } from "@tauri-apps/api/core";

async function start() {
  try {
    await initializePlugins();
    ReactDOM.createRoot(document.getElementById("root")!).render(
      <React.StrictMode><App /></React.StrictMode>,
    );
    await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
  } finally {
    await invoke("finish_startup");
  }
}

void start();
