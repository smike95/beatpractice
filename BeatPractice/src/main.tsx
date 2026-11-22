import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";
import { installWheelRouting } from "./utils/wheelRouting";

installWheelRouting();   // the wheel scrolls the zone under the pointer, not the one clicked last

// The canvases (waveform, ruler, loop picture) draw text with the font that is loaded at that moment and do not redraw when it arrives later:
// so the faces are loaded before the first screen is drawn (the files are inside the app, this takes a moment; never wait longer than 2 s).
const FACES = ["300 16px Kinetik", "400 16px Kinetik", "700 16px Kinetik", "italic 400 16px Kinetik", "italic 700 16px Kinetik"];
const fontsReady = typeof document !== "undefined" && document.fonts
  ? Promise.race([Promise.all(FACES.map((f) => document.fonts.load(f, "Aa\u0410\u0430\u0407\u0457 0123456789"))), new Promise((r) => setTimeout(r, 2000))])
  : Promise.resolve();

void fontsReady.catch(() => {}).then(() => {
  ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
});
