const PYODIDE_VERSION = "314.0.4";
let pyodide;

const ready = (async () => {
  self.postMessage({ type: "status", message: "Loading Pyodide…" });
  const { loadPyodide } = await import(
    `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/pyodide.mjs`
  );
  pyodide = await loadPyodide();
  await pyodide.loadPackage(["micropip", "anyio"]);
  self.postMessage({ type: "status", message: "Installing example…" });
  const response = await fetch(new URL("./wheels.json", self.location.href));
  if (!response.ok)
    throw new Error(`wheel manifest returned ${response.status}`);
  const wheels = await response.json();
  pyodide.globals.set(
    "wheels_json",
    JSON.stringify(
      Object.fromEntries(
        Object.entries(wheels).map(([name, path]) => [
          name,
          new URL(path, self.location.href).href,
        ]),
      ),
    ),
  );
  return pyodide.runPythonAsync(`
import asyncio
import json
import micropip

wheels = json.loads(wheels_json)
await micropip.install([wheels["spaday"], wheels["transports"], "starlette"])
await micropip.install(wheels["dagre"], deps=False)
from spaday_dagre import example

connection = "browser"

def receive_wire(frame):
    return json.dumps(example.server.recv(connection, frame).get(connection, []))

def flush_server():
    return json.dumps(example.server.flush().get(connection, []))

opening = example.server.open(connection, "json")
background_task = asyncio.create_task(example.sweep())
json.dumps({
    "tree": example.page.to_node(),
    "style": example.STYLES,
    "store": example.initial_store,
    "wires": opening,
})
`);
})();

let queue = Promise.resolve();

async function handle(message) {
  const snapshot = await ready;
  if (message.type === "start") {
    self.postMessage({ type: "snapshot", payload: JSON.parse(snapshot) });
  } else if (message.type === "wire") {
    pyodide.globals.set("wire_frame", message.frame);
    const wires = JSON.parse(pyodide.runPython("receive_wire(wire_frame)"));
    if (wires.length) self.postMessage({ type: "wires", wires });
  } else if (message.type === "flush") {
    const wires = JSON.parse(pyodide.runPython("flush_server()"));
    if (wires.length) self.postMessage({ type: "wires", wires });
  }
}

self.addEventListener("message", (event) => {
  queue = queue
    .then(() => handle(event.data))
    .catch((error) => {
      self.postMessage({ type: "error", message: String(error) });
    });
});
