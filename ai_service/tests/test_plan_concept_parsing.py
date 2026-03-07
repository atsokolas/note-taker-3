import json
import unittest

from ai_service import main


def _sample_request() -> main.ConceptPlanRequest:
    return main.ConceptPlanRequest(
        concept_title="Agentic Memory Systems",
        concept_description="How notes become reusable context for decision making.",
        candidate_items=[
            main.ConceptCandidateItem(
                type="article",
                id="a1",
                title="State of agent memory",
                text="Article snippet about memory architectures.",
                source="https://example.com/a1",
                score=0.92,
            ),
            main.ConceptCandidateItem(
                type="article",
                id="a2",
                title="Retrieval evaluation methods",
                text="Article snippet about retrieval metrics and benchmarks.",
                source="https://example.com/a2",
                score=0.88,
            ),
            main.ConceptCandidateItem(
                type="highlight",
                id="h1",
                title=None,
                text="Persistent memory improves continuity between sessions.",
                source="https://example.com/a1",
                score=0.90,
            ),
            main.ConceptCandidateItem(
                type="highlight",
                id="h2",
                title=None,
                text="Evaluation must measure relevance and recency together.",
                source="https://example.com/a2",
                score=0.84,
            ),
        ],
    )


def _assert_plan_constraints(
    test: unittest.TestCase,
    payload: dict,
    req: main.ConceptPlanRequest,
) -> None:
    test.assertEqual(
        set(payload.keys()),
        {"queries", "groups", "outline", "claims", "open_questions", "next_actions"},
    )
    test.assertGreaterEqual(len(payload["queries"]), 6)
    test.assertLessEqual(len(payload["queries"]), 12)
    test.assertGreaterEqual(len(payload["groups"]), 3)
    test.assertLessEqual(len(payload["groups"]), 8)
    test.assertGreaterEqual(len(payload["outline"]), 5)
    test.assertLessEqual(len(payload["outline"]), 12)
    test.assertGreaterEqual(len(payload["claims"]), 5)
    test.assertLessEqual(len(payload["claims"]), 12)
    test.assertGreaterEqual(len(payload["open_questions"]), 5)
    test.assertLessEqual(len(payload["open_questions"]), 12)
    test.assertGreaterEqual(len(payload["next_actions"]), 3)
    test.assertLessEqual(len(payload["next_actions"]), 8)

    candidate_ids = {item.id for item in req.candidate_items}
    highlight_ids = {item.id for item in req.candidate_items if item.type == "highlight"}
    for group in payload["groups"]:
        test.assertIn("title", group)
        test.assertIn("description", group)
        test.assertIn("item_refs", group)
        test.assertLessEqual(len(group["item_refs"]), 12)
        for ref in group["item_refs"]:
            test.assertIn(ref["type"], {"article", "highlight"})
            test.assertIn(ref["id"], candidate_ids)
    for section in payload["outline"]:
        test.assertIn("heading", section)
        test.assertIn("bullets", section)
        test.assertLessEqual(len(section["bullets"]), 8)
    for claim in payload["claims"]:
        test.assertIn(claim["confidence"], {"low", "medium", "high"})
        test.assertLessEqual(len(claim["evidence"]), 3)
        for evidence in claim["evidence"]:
            test.assertEqual(evidence["type"], "highlight")
            test.assertIn(evidence["id"], highlight_ids)


class TestConceptPlanEndpoint(unittest.IsolatedAsyncioTestCase):
    async def _run_with_mocked_llm(self, outputs, req=None):
        req = req or _sample_request()
        original_chat = main.hf_chat_complete
        original_config = main.get_hf_config
        original_ensure = main._ensure_text_model_supported
        calls = {"count": 0}

        async def fake_chat_complete(*args, **kwargs):
            idx = calls["count"]
            calls["count"] += 1
            text = outputs[idx] if idx < len(outputs) else outputs[-1]
            return {
                "model": "fake-model",
                "text": text,
                "method": "chat",
                "url": "http://fake",
                "status": 200,
                "body": {},
            }

        def fake_get_hf_config():
            return {
                "token": "fake-token",
                "provider": "hf-inference",
                "embedding_model": "fake-embed",
                "text_model": "fake-model",
                "models_base_url": "https://router.huggingface.co/hf-inference/models",
                "router_base_url": "https://router.huggingface.co/v1",
                "timeout_ms": 1000,
            }

        async def fake_ensure(_config):
            return "fake-model"

        try:
            main.hf_chat_complete = fake_chat_complete
            main.get_hf_config = fake_get_hf_config
            main._ensure_text_model_supported = fake_ensure
            result = await main.plan_concept(req)
            return result, calls["count"]
        finally:
            main.hf_chat_complete = original_chat
            main.get_hf_config = original_config
            main._ensure_text_model_supported = original_ensure

    async def test_plan_concept_valid_first_response(self):
        req = _sample_request()
        payload = {
            "queries": [f"query {i}" for i in range(1, 7)],
            "groups": [
                {
                    "title": "Core framing",
                    "description": "Frames the key problem and terms.",
                    "item_refs": [{"type": "article", "id": "a1", "why": "Overview context."}],
                },
                {
                    "title": "Evidence",
                    "description": "Tracks supporting and counter evidence.",
                    "item_refs": [{"type": "highlight", "id": "h1", "why": "Direct claim support."}],
                },
                {
                    "title": "Implications",
                    "description": "Connects findings to implementation choices.",
                    "item_refs": [{"type": "article", "id": "a2", "why": "Evaluation details."}],
                },
            ],
            "outline": [
                {"heading": f"Heading {i}", "bullets": [f"Bullet {i}."]} for i in range(1, 6)
            ],
            "claims": [
                {
                    "claim": f"Claim {i}",
                    "evidence": [{"type": "highlight", "id": "h1", "quote": "Support quote."}],
                    "confidence": "medium",
                }
                for i in range(1, 6)
            ],
            "open_questions": [f"Question {i}?" for i in range(1, 6)],
            "next_actions": [f"Action {i}" for i in range(1, 4)],
        }
        result, calls = await self._run_with_mocked_llm([json.dumps(payload)], req=req)
        self.assertEqual(calls, 1)
        _assert_plan_constraints(self, result, req)

    async def test_plan_concept_retries_once_when_first_output_not_json(self):
        req = _sample_request()
        fixed_payload = {
            "queries": [f"query {i}" for i in range(1, 7)],
            "groups": [
                {"title": "T1", "description": "D1", "item_refs": []},
                {"title": "T2", "description": "D2", "item_refs": []},
                {"title": "T3", "description": "D3", "item_refs": []},
            ],
            "outline": [{"heading": f"H{i}", "bullets": ["B"]} for i in range(1, 6)],
            "claims": [
                {"claim": f"C{i}", "evidence": [], "confidence": "low"} for i in range(1, 6)
            ],
            "open_questions": [f"Q{i}" for i in range(1, 6)],
            "next_actions": [f"A{i}" for i in range(1, 4)],
        }
        result, calls = await self._run_with_mocked_llm(
            ["<think>bad</think>not json", json.dumps(fixed_payload)],
            req=req,
        )
        self.assertEqual(calls, 2)
        _assert_plan_constraints(self, result, req)

    async def test_plan_concept_fallback_after_invalid_json_retry(self):
        req = _sample_request()
        result, calls = await self._run_with_mocked_llm(
            ["not json", "still not json"],
            req=req,
        )
        self.assertEqual(calls, 2)
        _assert_plan_constraints(self, result, req)

    async def test_plan_concept_drops_unknown_refs_and_invalid_evidence(self):
        req = _sample_request()
        payload = {
            "queries": [f"query {i}" for i in range(1, 7)],
            "groups": [
                {
                    "title": "G1",
                    "description": "D1",
                    "item_refs": [
                        {"type": "article", "id": "a1", "why": "valid"},
                        {"type": "article", "id": "missing", "why": "invalid id"},
                    ],
                },
                {"title": "G2", "description": "D2", "item_refs": []},
                {"title": "G3", "description": "D3", "item_refs": []},
            ],
            "outline": [{"heading": f"H{i}", "bullets": ["B"]} for i in range(1, 6)],
            "claims": [
                {
                    "claim": "Supported claim",
                    "evidence": [
                        {"type": "highlight", "id": "h1", "quote": "valid"},
                        {"type": "highlight", "id": "h999", "quote": "invalid id"},
                        {"type": "article", "id": "a1", "quote": "invalid type"},
                    ],
                    "confidence": "high",
                }
            ] + [{"claim": f"C{i}", "evidence": [], "confidence": "low"} for i in range(2, 6)],
            "open_questions": [f"Q{i}" for i in range(1, 6)],
            "next_actions": [f"A{i}" for i in range(1, 4)],
        }
        result, _ = await self._run_with_mocked_llm([json.dumps(payload)], req=req)
        _assert_plan_constraints(self, result, req)
        ids_in_refs = {ref["id"] for group in result["groups"] for ref in group["item_refs"]}
        self.assertNotIn("missing", ids_in_refs)
        for claim in result["claims"]:
            for evidence in claim["evidence"]:
                self.assertEqual(evidence["type"], "highlight")
                self.assertIn(evidence["id"], {"h1", "h2"})

    async def test_plan_concept_truncates_overflow_lists(self):
        req = _sample_request()
        payload = {
            "queries": [f"query {i}" for i in range(1, 40)],
            "groups": [
                {
                    "title": f"G{i}",
                    "description": "D",
                    "item_refs": [
                        {"type": "article", "id": "a1", "why": f"w{j}"}
                        for j in range(1, 40)
                    ],
                }
                for i in range(1, 20)
            ],
            "outline": [
                {"heading": f"H{i}", "bullets": [f"b{j}" for j in range(1, 20)]}
                for i in range(1, 20)
            ],
            "claims": [
                {
                    "claim": f"C{i}",
                    "evidence": [
                        {"type": "highlight", "id": "h1", "quote": "q1"},
                        {"type": "highlight", "id": "h2", "quote": "q2"},
                        {"type": "highlight", "id": "h1", "quote": "q3"},
                        {"type": "highlight", "id": "h2", "quote": "q4"},
                    ],
                    "confidence": "medium",
                }
                for i in range(1, 20)
            ],
            "open_questions": [f"Q{i}" for i in range(1, 30)],
            "next_actions": [f"A{i}" for i in range(1, 20)],
        }
        result, _ = await self._run_with_mocked_llm([json.dumps(payload)], req=req)
        _assert_plan_constraints(self, result, req)
        self.assertEqual(len(result["queries"]), 12)
        self.assertEqual(len(result["groups"]), 8)
        self.assertEqual(len(result["outline"]), 12)
        self.assertEqual(len(result["claims"]), 12)
        self.assertEqual(len(result["open_questions"]), 12)
        self.assertEqual(len(result["next_actions"]), 8)
        for group in result["groups"]:
            self.assertLessEqual(len(group["item_refs"]), 12)
        for section in result["outline"]:
            self.assertLessEqual(len(section["bullets"]), 8)
        for claim in result["claims"]:
            self.assertLessEqual(len(claim["evidence"]), 3)

    async def test_plan_concept_pads_underfilled_lists(self):
        req = _sample_request()
        payload = {
            "queries": ["one"],
            "groups": [{"title": "Only", "description": "One", "item_refs": []}],
            "outline": [{"heading": "Only", "bullets": []}],
            "claims": [{"claim": "Only", "evidence": [], "confidence": "unknown"}],
            "open_questions": ["Only one?"],
            "next_actions": ["Only one action"],
        }
        result, _ = await self._run_with_mocked_llm([json.dumps(payload)], req=req)
        _assert_plan_constraints(self, result, req)
        self.assertEqual(len(result["queries"]), 6)
        self.assertEqual(len(result["groups"]), 3)
        self.assertEqual(len(result["outline"]), 5)
        self.assertEqual(len(result["claims"]), 5)
        self.assertEqual(len(result["open_questions"]), 5)
        self.assertEqual(len(result["next_actions"]), 3)
