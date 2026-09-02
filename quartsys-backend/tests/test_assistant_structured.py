import json
import os
import sys
import unittest
from pathlib import Path


BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))
os.environ.setdefault(
    "DATABASE_URL", "sqlite:////tmp/quartsys-assistant-structured-test.db"
)

import main  # noqa: E402


class FakeStreamResponse:
    def __init__(self, lines):
        self._lines = lines

    def iter_lines(self, decode_unicode=False):
        for line in self._lines:
            yield line


class AssistantStructuredTests(unittest.TestCase):
    @classmethod
    def tearDownClass(cls):
        try:
            main.scheduler.shutdown(wait=False)
        except Exception:
            pass

    def test_stream_parser_preserves_utf8_chinese(self):
        content = (
            '{"blocks":[{"type":"heading","level":2,"text":"短线突破策略模板"},'
            '{"type":"table","columns":["项目","配置"],'
            '"rows":[["策略类型","短线趋势突破"]]}]}'
        )
        lines = [
            b"data: "
            + json.dumps(
                {"choices": [{"delta": {"content": content[:30]}}]},
                ensure_ascii=False,
            ).encode("utf-8"),
            b"data: "
            + json.dumps(
                {"choices": [{"delta": {"content": content[30:]}}]},
                ensure_ascii=False,
            ).encode("utf-8"),
            b"data: [DONE]",
        ]

        deltas = []
        raw, usage = main._assistant_collect_stream_content(
            FakeStreamResponse(lines),
            on_delta=deltas.append,
        )
        blocks, warnings = main._assistant_parse_and_validate(raw)

        self.assertEqual(blocks[0]["text"], "短线突破策略模板")
        self.assertEqual(blocks[1]["columns"], ["项目", "配置"])
        self.assertEqual(warnings, [])
        self.assertIsNone(usage)
        self.assertEqual("".join(deltas), content)

    def test_progressive_block_parser_emits_complete_valid_blocks(self):
        content = (
            '{"blocks":['
            '{"type":"heading","level":2,"text":"量化策略"},'
            '{"type":"paragraph","text":"先筛选股票池，再执行买卖与风控。"},'
            '{"type":"code","language":"python","content":"def signal(row):\\n    return row[\\"close\\"] > row[\\"ma20\\"]"}'
            ']}'
        )
        parser = main._AssistantStructuredStreamParser()
        blocks = []
        chunk_sizes = [1, 3, 2, 7, 5, 11]
        cursor = 0
        chunk_index = 0
        while cursor < len(content):
            size = chunk_sizes[chunk_index % len(chunk_sizes)]
            blocks.extend(parser.feed(content[cursor : cursor + size]))
            cursor += size
            chunk_index += 1

        self.assertEqual([block["type"] for block in blocks], ["heading", "paragraph", "code"])
        self.assertEqual(blocks[0]["text"], "量化策略")
        self.assertIn('row["close"]', blocks[2]["content"])

    def test_provider_stream_payloads_extract_anthropic_and_gemini_text(self):
        anthropic = {
            "type": "content_block_delta",
            "delta": {"type": "text_delta", "text": "港股"},
        }
        gemini = {
            "candidates": [
                {"content": {"parts": [{"text": "美股"}]}}
            ]
        }

        self.assertEqual(main._assistant_payload_content_parts(anthropic), ["港股"])
        self.assertEqual(main._assistant_payload_content_parts(gemini), ["美股"])

    def test_assistant_sse_payload_preserves_unicode_json(self):
        event = main._assistant_sse_payload(
            {"type": "block", "block": {"type": "paragraph", "text": "实时流式输出"}}
        )

        self.assertTrue(event.startswith("data: "))
        self.assertIn("实时流式输出", event)
        self.assertTrue(event.endswith("\n\n"))

    def test_json_extractor_skips_transport_chunks_before_blocks(self):
        transport_chunk = (
            '{"id":"chatcmpl-x","object":"chat.completion.chunk",'
            '"choices":[{"delta":{"content":"噪声"},"index":0}]}'
        )
        final_json = (
            '{"blocks":[{"type":"heading","level":2,"text":"短线突破策略模板"},'
            '{"type":"table","columns":["项目","配置"],'
            '"rows":[["策略类型","短线趋势突破"]]}]}'
        )

        blocks, warnings = main._assistant_parse_and_validate(
            transport_chunk + final_json
        )

        self.assertEqual(blocks[0]["text"], "短线突破策略模板")
        self.assertEqual(blocks[1]["columns"], ["项目", "配置"])
        self.assertEqual(warnings, [])


if __name__ == "__main__":
    unittest.main()
