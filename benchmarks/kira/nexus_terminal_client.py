#!/usr/bin/env python3
"""Small Nexus terminal client scaffold for KIRA/Terminal-Bench experiments.

This module keeps the harness layer outside the Vutler runtime. It talks to the
new Nexus terminal endpoints over HTTP and provides marker-based polling helpers
that a Harbor/KIRA agent can call instead of a local tmux session.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import shlex
import time
import uuid
from dataclasses import dataclass
from typing import Any
from urllib import error, request


DEFAULT_TIMEOUT_SEC = 30.0
DEFAULT_WAIT_MS = 300


class NexusTerminalError(RuntimeError):
    """Raised when a Nexus terminal request fails."""


@dataclass
class NexusTerminalClient:
    base_url: str
    api_key: str
    node_id: str
    timeout_sec: float = DEFAULT_TIMEOUT_SEC

    def open_session(
        self,
        cwd: str,
        *,
        cols: int | None = None,
        rows: int | None = None,
        env: dict[str, str] | None = None,
        shell: str | None = None,
    ) -> dict[str, Any]:
        payload = {"cwd": cwd}
        if cols is not None:
            payload["cols"] = cols
        if rows is not None:
            payload["rows"] = rows
        if env:
            payload["env"] = env
        if shell:
            payload["shell"] = shell
        return self._unwrap(self._request("POST", f"/api/v1/nexus/nodes/{self.node_id}/terminal/open", payload))

    def exec_session(
        self,
        session_id: str,
        *,
        input_text: str | None = None,
        wait_ms: int = DEFAULT_WAIT_MS,
        append_newline: bool = True,
    ) -> dict[str, Any]:
        payload = {
            "input": input_text,
            "waitMs": wait_ms,
            "appendNewline": append_newline,
        }
        return self._unwrap(
            self._request(
                "POST",
                f"/api/v1/nexus/nodes/{self.node_id}/terminal/{session_id}/exec",
                payload,
            )
        )

    def read_session(self, session_id: str, *, cursor: int = 0) -> dict[str, Any]:
        return self._unwrap(
            self._request(
                "POST",
                f"/api/v1/nexus/nodes/{self.node_id}/terminal/{session_id}/read",
                {"cursor": cursor},
            )
        )

    def snapshot_session(self, session_id: str) -> dict[str, Any]:
        return self._unwrap(
            self._request(
                "GET",
                f"/api/v1/nexus/nodes/{self.node_id}/terminal/{session_id}",
            )
        )

    def close_session(self, session_id: str) -> dict[str, Any]:
        return self._unwrap(
            self._request(
                "DELETE",
                f"/api/v1/nexus/nodes/{self.node_id}/terminal/{session_id}",
            )
        )

    def read_binary_file(self, path: str) -> dict[str, Any]:
        return self._unwrap(
            self._request(
                "POST",
                f"/api/v1/nexus/nodes/{self.node_id}/files/base64",
                {"path": path},
            )
        )

    def run_command_with_marker(
        self,
        session_id: str,
        command: str,
        *,
        wait_ms: int = DEFAULT_WAIT_MS,
        timeout_sec: float = DEFAULT_TIMEOUT_SEC,
        poll_interval_sec: float = 0.25,
    ) -> dict[str, Any]:
        marker = f"__CMDEND__{uuid.uuid4().hex}__"
        payload = f"{command}\nprintf '\\n{marker}\\n'\n"
        result = self.exec_session(
            session_id,
            input_text=payload,
            wait_ms=wait_ms,
            append_newline=False,
        )

        output = result.get("output", "")
        cursor = int(result.get("cursor", 0))
        buffer_start = int(result.get("bufferStart", 0))
        closed = bool(result.get("closed", False))
        exit_code = result.get("exitCode")

        deadline = time.monotonic() + timeout_sec
        while marker not in output and not closed:
            if time.monotonic() >= deadline:
                raise NexusTerminalError(f"Timed out waiting for marker {marker}")
            time.sleep(poll_interval_sec)
            read_result = self.read_session(session_id, cursor=cursor)
            output += read_result.get("output", "")
            cursor = int(read_result.get("cursor", cursor))
            buffer_start = int(read_result.get("bufferStart", buffer_start))
            closed = bool(read_result.get("closed", False))
            exit_code = read_result.get("exitCode", exit_code)

        cleaned_output = "\n".join(
            line for line in output.splitlines() if marker not in line
        )
        return {
            "sessionId": session_id,
            "output": cleaned_output,
            "cursor": cursor,
            "bufferStart": buffer_start,
            "closed": closed,
            "exitCode": exit_code,
            "marker": marker,
        }

    def bootstrap_environment(self, session_id: str) -> dict[str, Any]:
        commands = [
            "pwd",
            "printf '\\n---UNAME---\\n' && uname -a",
            "printf '\\n---PYTHON---\\n' && (python3 --version || python --version || true)",
        ]
        return self.run_command_with_marker(session_id, "\n".join(commands), wait_ms=400)

    def read_file_base64_via_terminal(
        self,
        session_id: str,
        path: str,
        *,
        timeout_sec: float = DEFAULT_TIMEOUT_SEC,
    ) -> dict[str, Any]:
        start_marker = f"__FILEBASE64_START__{uuid.uuid4().hex}__"
        end_marker = f"__FILEBASE64_END__{uuid.uuid4().hex}__"
        quoted_path = shlex.quote(path)
        python_snippet = (
            "import base64, pathlib, sys; "
            "print(base64.b64encode(pathlib.Path(sys.argv[1]).read_bytes()).decode(), end='')"
        )
        quoted_python = shlex.quote(python_snippet)
        command = (
            f"printf '%s\\n' {shlex.quote(start_marker)}\n"
            f"(python3 -c {quoted_python} {quoted_path} "
            f"|| python -c {quoted_python} {quoted_path} "
            f"|| (base64 < {quoted_path} | tr -d '\\n'))\n"
            f"printf '\\n%s\\n' {shlex.quote(end_marker)}"
        )
        result = self.run_command_with_marker(
            session_id,
            command,
            wait_ms=400,
            timeout_sec=timeout_sec,
        )
        output = str(result.get("output", "") or "")
        match = re.search(
            rf"(?:^|\r?\n){re.escape(start_marker)}\r?\n(?P<body>[\s\S]*?)(?:\r?\n){re.escape(end_marker)}(?:\r?\n|$)",
            output,
        )
        if not match:
            raise NexusTerminalError(f"Failed to extract base64 payload for '{path}' from terminal output")

        content_b64 = "".join(match.group("body").splitlines()).strip()
        if not content_b64:
            raise NexusTerminalError(f"Failed to read file '{path}': empty base64 payload")

        result["contentBase64"] = content_b64
        return result

    def _request(self, method: str, path: str, payload: dict[str, Any] | None = None) -> dict[str, Any]:
        body = None
        headers = {
            "Accept": "application/json",
            "X-API-Key": self.api_key,
        }
        if payload is not None:
            body = json.dumps(payload).encode("utf-8")
            headers["Content-Type"] = "application/json"

        req = request.Request(
            self.base_url.rstrip("/") + path,
            data=body,
            method=method,
            headers=headers,
        )

        try:
            with request.urlopen(req, timeout=self.timeout_sec) as response:
                raw = response.read().decode("utf-8")
                return json.loads(raw) if raw else {}
        except error.HTTPError as exc:
            body_text = exc.read().decode("utf-8", errors="replace")
            raise NexusTerminalError(f"HTTP {exc.code}: {body_text}") from exc
        except error.URLError as exc:
            raise NexusTerminalError(f"Request failed: {exc.reason}") from exc

    @staticmethod
    def _unwrap(response: dict[str, Any]) -> dict[str, Any]:
        if not isinstance(response, dict):
            raise NexusTerminalError("Unexpected Nexus response payload")
        if response.get("queued") is True:
            raise NexusTerminalError("Request was queued instead of completing synchronously")
        if response.get("status") == "error":
            raise NexusTerminalError(str(response.get("error") or "Nexus request failed"))
        return response.get("data", response)


def _build_client_from_env(timeout_sec: float) -> NexusTerminalClient:
    base_url = os.environ.get("VUTLER_BASE_URL", "https://app.vutler.ai")
    api_key = os.environ.get("VUTLER_API_KEY")
    node_id = os.environ.get("VUTLER_NEXUS_NODE_ID")
    if not api_key:
        raise NexusTerminalError("VUTLER_API_KEY is required")
    if not node_id:
        raise NexusTerminalError("VUTLER_NEXUS_NODE_ID is required")
    return NexusTerminalClient(base_url=base_url, api_key=api_key, node_id=node_id, timeout_sec=timeout_sec)


def main() -> int:
    parser = argparse.ArgumentParser(description="Run a command through Nexus terminal session endpoints.")
    parser.add_argument("--cwd", required=True, help="Working directory for the terminal session")
    parser.add_argument("--command", required=True, help="Shell command to execute")
    parser.add_argument("--timeout-sec", type=float, default=DEFAULT_TIMEOUT_SEC, help="HTTP and marker wait timeout")
    parser.add_argument("--wait-ms", type=int, default=DEFAULT_WAIT_MS, help="Initial post-send wait before polling")
    args = parser.parse_args()

    client = _build_client_from_env(args.timeout_sec)
    opened = client.open_session(args.cwd)
    session_id = opened["sessionId"]

    try:
        bootstrap = client.bootstrap_environment(session_id)
        result = client.run_command_with_marker(
            session_id,
            args.command,
            wait_ms=args.wait_ms,
            timeout_sec=args.timeout_sec,
        )
        print(json.dumps({
            "opened": opened,
            "bootstrap": bootstrap,
            "result": result,
        }, indent=2))
    finally:
        try:
            client.close_session(session_id)
        except NexusTerminalError:
            pass

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
