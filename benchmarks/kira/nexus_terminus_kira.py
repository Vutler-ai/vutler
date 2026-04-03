#!/usr/bin/env python3
"""KIRA adapter that executes Terminal-Bench commands through Nexus sessions.

The goal is to keep KIRA's planning/tool-calling behavior while replacing the
local tmux execution backend with the Nexus terminal session endpoints.
"""

from __future__ import annotations

import asyncio
import os
from pathlib import Path
from typing import Any

from .nexus_terminal_client import (
    DEFAULT_TIMEOUT_SEC,
    NexusTerminalClient,
    NexusTerminalError,
    _build_client_from_env,
)

try:
    from terminus_kira.terminus_kira import TerminusKira
except ImportError:  # pragma: no cover - import-time fallback for repos without KIRA installed.
    TerminusKira = None

try:
    from anthropic_caching import add_anthropic_caching
except ImportError:  # pragma: no cover - cache helper is optional for the adapter.
    def add_anthropic_caching(messages: list[dict[str, Any]], _model_name: str) -> list[dict[str, Any]]:
        return messages


class NexusTerminusKira(TerminusKira if TerminusKira is not None else object):
    """Thin KIRA adapter backed by the Nexus terminal session API."""

    def __init__(
        self,
        *args: Any,
        nexus_client: NexusTerminalClient | None = None,
        session_cwd: str | None = None,
        **kwargs: Any,
    ) -> None:
        if TerminusKira is None:
            raise RuntimeError(
                "NexusTerminusKira requires KIRA/Terminus-KIRA to be installed in the active Python environment."
            )

        super().__init__(*args, **kwargs)
        self._nexus_client = nexus_client or _build_client_from_env(DEFAULT_TIMEOUT_SEC)
        self._session_cwd = session_cwd or os.environ.get("VUTLER_TASK_CWD") or os.getcwd()
        self._nexus_session_id: str | None = None
        self._nexus_cursor = 0
        self._bootstrap_output = ""

    @staticmethod
    def name() -> str:
        return "nexus-terminus-kira"

    def version(self) -> str | None:
        return "0.1.0"

    async def run(self, instruction: str, environment: Any, context: Any) -> None:
        await self._ensure_nexus_session()
        try:
            await super().run(instruction, environment, context)
        finally:
            await self._close_nexus_session()

    async def _ensure_nexus_session(self) -> None:
        if self._nexus_session_id:
            return

        opened = await asyncio.to_thread(self._nexus_client.open_session, self._session_cwd)
        self._nexus_session_id = str(opened["sessionId"])
        self._nexus_cursor = int(opened.get("cursor", 0))

        bootstrap = await asyncio.to_thread(self._nexus_client.bootstrap_environment, self._nexus_session_id)
        self._nexus_cursor = int(bootstrap.get("cursor", self._nexus_cursor))
        self._bootstrap_output = str(bootstrap.get("output", "") or "")

        if getattr(self, "logger", None):
            self.logger.info(
                "Opened Nexus terminal session %s in %s",
                self._nexus_session_id,
                self._session_cwd,
            )

    async def _close_nexus_session(self) -> None:
        if not self._nexus_session_id:
            return

        session_id = self._nexus_session_id
        self._nexus_session_id = None
        try:
            await asyncio.to_thread(self._nexus_client.close_session, session_id)
        except NexusTerminalError:
            if getattr(self, "logger", None):
                self.logger.warning("Failed to close Nexus terminal session %s", session_id)

    async def _execute_commands(self, commands: list[Any], session: Any) -> tuple[bool, str]:
        del session
        await self._ensure_nexus_session()
        assert self._nexus_session_id is not None

        chunks: list[str] = []
        if self._bootstrap_output:
          chunks.append(self._bootstrap_output)
          self._bootstrap_output = ""

        for command in commands:
            keystrokes = str(getattr(command, "keystrokes", "") or "")
            duration_sec = float(getattr(command, "duration_sec", 1.0) or 0.0)

            if keystrokes:
                result = await asyncio.to_thread(
                    self._nexus_client.run_command_with_marker,
                    self._nexus_session_id,
                    keystrokes,
                    wait_ms=max(100, int(max(0.1, min(duration_sec, 60.0)) * 1000)),
                    timeout_sec=max(DEFAULT_TIMEOUT_SEC, min(duration_sec + 30.0, 180.0)),
                )
            else:
                if duration_sec > 0:
                    await asyncio.sleep(duration_sec)
                result = await asyncio.to_thread(
                    self._nexus_client.read_session,
                    self._nexus_session_id,
                    cursor=self._nexus_cursor,
                )

            self._nexus_cursor = int(result.get("cursor", self._nexus_cursor))
            output = str(result.get("output", "") or "")
            if output:
                chunks.append(output)

            if result.get("closed"):
                chunks.append(
                    f"[nexus] terminal session closed unexpectedly (exit_code={result.get('exitCode')})"
                )
                break

        output_text = "\n".join(chunk for chunk in chunks if chunk)
        return False, self._limit_output_length(output_text)

    async def _execute_image_read(self, image_read: Any, chat: Any, original_instruction: str = "") -> str:
        del original_instruction
        file_path = str(getattr(image_read, "file_path", "") or "")
        instruction = str(getattr(image_read, "image_read_instruction", "") or "")
        if not file_path or not instruction:
            return "ERROR: image_read requires both file_path and image_read_instruction."

        try:
            file_payload = await asyncio.to_thread(self._nexus_client.read_binary_file, file_path)
        except NexusTerminalError as bridge_err:
            if getattr(self, "logger", None):
                self.logger.warning("Nexus file bridge failed for %s: %s", file_path, bridge_err)
            if not self._nexus_session_id:
                return f"ERROR: {bridge_err}"
            try:
                file_payload = await asyncio.to_thread(
                    self._nexus_client.read_file_base64_via_terminal,
                    self._nexus_session_id,
                    file_path,
                )
                file_payload = {
                    "path": file_path,
                    "contentBase64": str(file_payload.get("contentBase64", "") or "").strip(),
                    "mimeType": self._infer_mime_type(file_path),
                }
            except NexusTerminalError as terminal_err:
                return f"ERROR: Failed to read file '{file_path}': {terminal_err}"

        mime = str(file_payload.get("mimeType") or self._infer_mime_type(file_path))
        if not mime.startswith("image/"):
            return (
                f"ERROR: Unsupported image format '{Path(file_path).suffix.lower()}'. "
                "Convert the file to PNG, JPG, GIF, or WEBP first."
            )

        b64 = str(file_payload.get("contentBase64", "") or "").replace("\n", "")
        if not b64:
            return f"ERROR: Failed to read file '{file_path}': empty file payload."

        multimodal_messages = add_anthropic_caching([
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": instruction},
                    {
                        "type": "image_url",
                        "image_url": {"url": f"data:{mime};base64,{b64}"},
                    },
                ],
            },
        ], getattr(self, "_model_name", ""))

        try:
            response = await self._call_llm_for_image(
                messages=multimodal_messages,
                model=self._model_name,
                temperature=self._temperature,
                max_tokens=self._llm.get_model_output_limit(),
            )
        except Exception as err:  # pragma: no cover - upstream model call semantics.
            return f"ERROR: {err}"

        response_text = response["choices"][0]["message"]["content"]
        usage = response.get("usage", {})
        if usage:
            chat._cumulative_input_tokens += usage.get("prompt_tokens", 0)
            chat._cumulative_output_tokens += usage.get("completion_tokens", 0)
            prompt_details = usage.get("prompt_tokens_details")
            cached = 0
            if isinstance(prompt_details, dict):
                cached = prompt_details.get("cached_tokens", 0)
            elif prompt_details:
                cached = getattr(prompt_details, "cached_tokens", 0)
            chat._cumulative_cache_tokens += cached or 0

        return f"File Read Result for '{file_path}':\n{response_text}"

    @staticmethod
    def _infer_mime_type(file_path: str) -> str:
        ext = Path(file_path).suffix.lower()
        return {
            ".png": "image/png",
            ".jpg": "image/jpeg",
            ".jpeg": "image/jpeg",
            ".gif": "image/gif",
            ".webp": "image/webp",
        }.get(ext, "application/octet-stream")
