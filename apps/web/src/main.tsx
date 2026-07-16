import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@furg/design-system/styles/base.css";
import "@furg/design-system/styles/themes/furg.css";
import "bpmn-js/dist/assets/diagram-js.css";
import "bpmn-js/dist/assets/bpmn-font/css/bpmn.css";
import "@xyflow/react/dist/style.css";
import "./styles.css";
import { App } from "./App";

createRoot(document.getElementById("root")!).render(
  <StrictMode><App /></StrictMode>,
);
