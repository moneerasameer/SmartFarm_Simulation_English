#!/usr/bin/env python3
"""Capture screenshots of the running Smart Farm dashboard (reproducible evidence).

The Streamlit application is a websocket-rendered single-page app, so a plain
`--screenshot` of the URL only captures the loading skeleton. This utility drives
headless Chrome through the DevTools Protocol, waits for the script to render and
then captures the page - optionally after clicking one of the tabs.

Requirements
  * Google Chrome installed (used in --headless mode, nothing else)
  * the dashboard already running, e.g.
        .venv/bin/streamlit run python_dashboard/app.py --server.port 8511 --server.headless true
  * the project virtual environment (it provides the `tornado` websocket client)

Usage
  # 1. start Chrome with the debugging port
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
      --headless=new --disable-gpu --user-data-dir=/tmp/chrome-cdp \
      --remote-debugging-port=9222 about:blank &

  # 2. capture the overview page
  .venv/bin/python integration/capture_dashboard.py \
      http://localhost:8511 results/Fig13_dashboard_overview.png 16

  # 3. capture a specific tab
  .venv/bin/python integration/capture_dashboard.py \
      http://localhost:8511 results/Fig14_dashboard_irrigation.png 16 "Irrigation control"
"""

import asyncio
import base64
import json
import sys
import urllib.request

from tornado.websocket import websocket_connect

WIDTH = 1500
DEVTOOLS = "http://127.0.0.1:9222"


async def capture(url: str, out_path: str, wait_s: float, tab_name: str, viewport_h: int) -> int:
    targets = json.load(urllib.request.urlopen(f"{DEVTOOLS}/json/list"))
    page = next((t for t in targets if t.get("type") == "page"), None)
    if page is None:
        print("error: no Chrome page target found - is Chrome running with --remote-debugging-port=9222?")
        return 2

    ws = await websocket_connect(page["webSocketDebuggerUrl"], max_message_size=64 * 1024 * 1024)
    counter = 0

    async def call(method, params=None):
        nonlocal counter
        counter += 1
        msg_id = counter
        await ws.write_message(json.dumps({"id": msg_id, "method": method, "params": params or {}}))
        while True:
            raw = await ws.read_message()
            if raw is None:
                raise RuntimeError("DevTools websocket closed")
            data = json.loads(raw)
            if data.get("id") == msg_id:
                return data

    await call("Page.enable")
    await call("Emulation.setDeviceMetricsOverride", {
        "width": WIDTH, "height": viewport_h, "deviceScaleFactor": 1, "mobile": False})
    await call("Page.navigate", {"url": url})
    print(f"navigated to {url}; waiting {wait_s:.0f}s for the Streamlit script to render")
    await asyncio.sleep(wait_s)

    if tab_name:
        script = (
            "(() => {"
            "  const nodes = [...document.querySelectorAll('[role=\"tab\"], button')];"
            f" const target = nodes.find(x => x.textContent.trim() === {json.dumps(tab_name)});"
            "  if (!target) return 'tab not found';"
            "  target.click(); return 'clicked ' + target.textContent.trim();"
            "})()"
        )
        result = await call("Runtime.evaluate", {"expression": script, "returnByValue": True})
        print("tab:", result["result"]["result"].get("value"))
        await asyncio.sleep(4)

    metrics = await call("Page.getLayoutMetrics")
    height = max(viewport_h, min(int(metrics["result"]["cssContentSize"]["height"]), 6000))
    shot = await call("Page.captureScreenshot", {
        "format": "png", "captureBeyondViewport": True,
        "clip": {"x": 0, "y": 0, "width": WIDTH, "height": height, "scale": 1}})

    data = base64.b64decode(shot["result"]["data"])
    with open(out_path, "wb") as handle:
        handle.write(data)
    print(f"wrote {out_path} ({len(data)} bytes, {WIDTH}x{height})")
    ws.close()
    return 0


if __name__ == "__main__":
    args = sys.argv[1:]
    if len(args) < 2:
        print(__doc__)
        raise SystemExit(2)
    raise SystemExit(asyncio.run(capture(
        args[0], args[1], float(args[2]) if len(args) > 2 else 15.0,
        args[3] if len(args) > 3 else "",
        int(args[4]) if len(args) > 4 else 1900)))
