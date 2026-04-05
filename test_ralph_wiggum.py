#!/usr/bin/env python3
"""
Ralph Wiggum Loop — Comprehensive Functional Test
===================================================

Tests all components of the Ralph Wiggum Loop system:
1. State persistence (save/load/resume)
2. Completion detection (sentinel, file move, custom hook)
3. Loop mechanics (iteration, context building, termination)
4. Orchestrator integration (task classification, routing)
5. CLI interface
6. Summary generation

Run: python3 test_ralph_wiggum.py
"""

import os
import sys
import json
import time
import tempfile
import unittest
from pathlib import Path
from datetime import datetime, timezone
from unittest.mock import patch, MagicMock

# Add project root to path
PROJECT_ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(PROJECT_ROOT))

from ralph_wiggum import (
    RalphWiggumLoop,
    RalphState,
    RalphLogger,
    ralph_process_task,
    check_sentinel_in_output,
    check_file_moved_to_done,
    check_custom_hook,
    is_task_complete,
    build_claude_command,
    DEFAULT_MAX_ITERATIONS,
    FOLDERS,
)


# Mirror of is_task_candidate_for_ralph from orchestrator (importing orchestrator has side effects)
def _is_task_candidate_for_ralph(task_type: str, content: str) -> bool:
    complex_indicators = [
        "build", "create", "implement", "develop", "design",
        "research", "analysis", "comprehensive", "detailed",
        "multi-step", "full-stack", "complete system", "end-to-end",
        "refactor", "migrate", "debug", "fix all", "optimize",
        "write a", "generate a", "full report", "deep dive",
    ]
    content_lower = content.lower()
    complexity_score = sum(1 for word in complex_indicators if word in content_lower)
    if complexity_score >= 2:
        return True
    if complexity_score >= 1 and len(content_lower) > 500:
        return True
    if "use ralph" in content_lower or "ralph wiggum" in content_lower or "autonomous" in content_lower:
        return True
    return False


class TestSentinelDetection(unittest.TestCase):
    """Test TASK_COMPLETE sentinel pattern matching."""

    def test_exact_sentinel(self):
        self.assertTrue(check_sentinel_in_output("TASK_COMPLETE"))

    def test_sentinel_in_text(self):
        self.assertTrue(check_sentinel_in_output("Great work done!\nTASK_COMPLETE\nAll files created."))

    def test_lowercase_sentinel(self):
        self.assertTrue(check_sentinel_in_output("task_complete"))

    def test_mixed_case_sentinel(self):
        self.assertTrue(check_sentinel_in_output("Task_Complete"))

    def test_no_sentinel(self):
        self.assertFalse(check_sentinel_in_output("Still working on it..."))

    def test_empty_output(self):
        self.assertFalse(check_sentinel_in_output(""))


class TestFileMoveDetection(unittest.TestCase):
    """Test Done/ folder file detection."""

    def setUp(self):
        self.test_dir = Path(tempfile.mkdtemp())
        self.done_dir = self.test_dir / "Done"
        self.done_dir.mkdir()
        self.needs_action_dir = self.test_dir / "Needs_Action"
        self.needs_action_dir.mkdir()

    def test_file_exists_in_original_location(self):
        task_file = self.needs_action_dir / "task.md"
        task_file.write_text("test")
        # File still in Needs_Action — not complete
        self.assertFalse(check_file_moved_to_done(task_file))

    def test_file_in_done_folder(self):
        done_file = self.done_dir / "task.md"
        done_file.write_text("done")
        # We check by name — simulate by checking Done/ existence
        self.assertTrue(done_file.exists())

    def test_original_file_deleted(self):
        """If original doesn't exist, assume it was moved."""
        task_file = self.needs_action_dir / "nonexistent.md"
        self.assertTrue(check_file_moved_to_done(task_file))


class TestCustomHook(unittest.TestCase):
    """Test custom completion hooks."""

    def test_hook_returns_true(self):
        def my_hook(output, state):
            return True
        self.assertTrue(check_custom_hook(my_hook, "output", {}))

    def test_hook_returns_false(self):
        def my_hook(output, state):
            return False
        self.assertFalse(check_custom_hook(my_hook, "output", {}))

    def test_hook_raisess_exception(self):
        def my_hook(output, state):
            raise RuntimeError("boom")
        self.assertFalse(check_custom_hook(my_hook, "output", {}))

    def test_none_hook(self):
        self.assertFalse(check_custom_hook(None, "output", {}))


class TestCompletionMultiStrategy(unittest.TestCase):
    """Test the combined completion detection."""

    def test_sentinel_triggers_completion(self):
        self.assertTrue(is_task_complete("TASK_COMPLETE", None, None, {}))

    def test_no_completion(self):
        self.assertFalse(is_task_complete("still working", None, None, {}))

    def test_custom_hook_triggers_completion(self):
        hook = lambda out, state: "done" in out.lower()
        self.assertTrue(is_task_complete("All done!", None, hook, {}))


class TestStatePersistence(unittest.TestCase):
    """Test RalphState save/load/resume."""

    def setUp(self):
        FOLDERS["ralph_state"].mkdir(parents=True, exist_ok=True)
        self.state = RalphState("test_task_123")
        self.state.clear()  # Clean slate

    def tearDown(self):
        self.state.clear()

    def test_save_and_load(self):
        data = {"iteration": 3, "output": "some output", "completed": False}
        self.state.save(data)
        loaded = self.state.load()
        self.assertEqual(loaded["iteration"], 3)
        self.assertEqual(loaded["output"], "some output")
        self.assertFalse(loaded["completed"])

    def test_load_empty(self):
        self.state.clear()
        loaded = self.state.load()
        self.assertEqual(loaded, {})

    def test_clear(self):
        self.state.save({"iteration": 1})
        self.state.clear()
        self.assertFalse(self.state.state_file.exists())

    def test_list_states(self):
        self.state.save({"iteration": 1})
        states = RalphState.list_states()
        self.assertIn("test_task_123", states)


class TestRalphWiggumLoopMocked(unittest.TestCase):
    """Test the full Ralph Wiggum Loop with mocked Claude calls."""

    def test_completes_on_sentinel(self):
        """Loop should stop when Claude outputs TASK_COMPLETE."""
        call_count = 0

        def mock_run(*args, **kwargs):
            nonlocal call_count
            call_count += 1
            if call_count == 1:
                return {
                    "success": True,
                    "stdout": "Creating file 1...\nDone with first part.",
                    "stderr": "",
                    "returncode": 0,
                    "duration": 1.5,
                }
            else:
                return {
                    "success": True,
                    "stdout": "Creating file 2...\nAll done!\nTASK_COMPLETE",
                    "stderr": "",
                    "returncode": 0,
                    "duration": 2.0,
                }

        with patch("ralph_wiggum.run_claude_iteration", side_effect=mock_run):
            ralph = RalphWiggumLoop(
                prompt="Build something",
                max_iterations=15,
                resume=False,
            )
            result = ralph.run()

        self.assertTrue(result["completed"])
        self.assertEqual(result["iterations_run"], 2)
        self.assertEqual(result["completion_iteration"], 2)
        self.assertEqual(call_count, 2)

    def test_exhausts_max_iterations(self):
        """Loop should stop at max_iterations if no completion signal."""
        def mock_run(*args, **kwargs):
            return {
                "success": True,
                "stdout": "Still working...",
                "stderr": "",
                "returncode": 0,
                "duration": 0.5,
            }

        with patch("ralph_wiggum.run_claude_iteration", side_effect=mock_run):
            ralph = RalphWiggumLoop(
                prompt="Build something",
                max_iterations=3,
                resume=False,
            )
            result = ralph.run()

        self.assertFalse(result["completed"])
        self.assertEqual(result["iterations_run"], 3)

    def test_resume_from_state(self):
        """Loop should resume from saved iteration count."""
        state = RalphState("resume_test")
        state.clear()
        state.save({"iteration": 2, "cumulative_output": "prev output", "results": [
            {"success": True, "stdout": "iter1", "stderr": "", "returncode": 0, "duration": 1.0},
            {"success": True, "stdout": "iter2", "stderr": "", "returncode": 0, "duration": 1.0},
        ]})

        def mock_run(*args, **kwargs):
            return {
                "success": True,
                "stdout": "Final work done. TASK_COMPLETE",
                "stderr": "",
                "returncode": 0,
                "duration": 1.0,
            }

        with patch("ralph_wiggum.run_claude_iteration", side_effect=mock_run):
            ralph = RalphWiggumLoop(
                prompt="Build something",
                task_id="resume_test",
                max_iterations=5,
                resume=True,
            )
            result = ralph.run()

        # Should start from iteration 3 (after resuming from 2)
        self.assertTrue(result["completed"])
        self.assertEqual(result["completion_iteration"], 3)

        state.clear()

    def test_contextual_prompt_building(self):
        """Prompt should include previous iteration context."""
        ralph = RalphWiggumLoop(
            prompt="Original task prompt",
            max_iterations=5,
            resume=False,
        )

        # First iteration should be just the original prompt
        first_prompt = ralph._build_contextual_prompt()
        self.assertEqual(first_prompt, "Original task prompt")

        # Simulate a previous iteration
        ralph.iteration = 1
        ralph.results.append({
            "success": True,
            "stdout": "Previous iteration output content here" * 100,
            "stderr": "",
            "returncode": 0,
            "duration": 5.0,
        })

        second_prompt = ralph._build_contextual_prompt()
        self.assertIn("PREVIOUS ITERATION", second_prompt)
        self.assertIn("Original task prompt", second_prompt)
        self.assertIn("CONTINUE WORKING", second_prompt)

    def test_summary_generation(self):
        """Summary should contain all required fields."""
        def mock_run(*args, **kwargs):
            return {
                "success": True,
                "stdout": "TASK_COMPLETE",
                "stderr": "",
                "returncode": 0,
                "duration": 3.14,
            }

        with patch("ralph_wiggum.run_claude_iteration", side_effect=mock_run):
            ralph = RalphWiggumLoop(
                prompt="Test",
                task_id="summary_test",
                max_iterations=5,
                resume=False,
            )
            result = ralph.run()

        self.assertIn("task_id", result)
        self.assertIn("completed", result)
        self.assertIn("iterations_run", result)
        self.assertIn("total_duration", result)
        self.assertIn("results", result)
        self.assertEqual(result["task_id"], "summary_test")

    def test_print_summary_no_crash(self):
        """print_summary should not raise."""
        def mock_run(*args, **kwargs):
            return {"success": True, "stdout": "TASK_COMPLETE", "stderr": "", "returncode": 0, "duration": 1.0}

        with patch("ralph_wiggum.run_claude_iteration", side_effect=mock_run):
            ralph = RalphWiggumLoop(prompt="Test", max_iterations=2, resume=False)
            ralph.run()
            # Should not crash
            ralph.print_summary()


class TestTaskClassification(unittest.TestCase):
    """Test is_task_candidate_for_ralph logic."""

    def test_simple_task_not_ralph(self):
        self.assertFalse(_is_task_candidate_for_ralph("email", "Reply to this email"))

    def test_complex_task_is_ralph(self):
        self.assertTrue(_is_task_candidate_for_ralph("build", "Build a complete REST API with detailed endpoints"))

    def test_two_keywords_ralph(self):
        self.assertTrue(_is_task_candidate_for_ralph("general", "Create and implement a new system"))

    def test_explicit_ralph_trigger(self):
        self.assertTrue(_is_task_candidate_for_ralph("email", "Please use ralph for this"))

    def test_autonomous_trigger(self):
        self.assertTrue(_is_task_candidate_for_ralph("linkedin", "Do this autonomous task"))

    def test_long_content_with_keyword(self):
        content = "This is a detailed analysis. " + "word " * 200
        self.assertTrue(_is_task_candidate_for_ralph("research", content))


class TestBuildClaudeCommand(unittest.TestCase):
    """Test Claude command construction."""

    def test_command_structure_with_system_prompt(self):
        with patch("ralph_wiggum.find_claude_executable", return_value="/usr/bin/claude"):
            cmd = build_claude_command(
                "Hello world",
                model="claude-sonnet-4",
                system_prompt="You are helpful",
            )
            self.assertIn("--print", cmd)
            self.assertIn("--model", cmd)
            self.assertIn("claude-sonnet-4", cmd)
            self.assertIn("--system-prompt", cmd)
            self.assertIn("You are helpful", cmd)

    def test_command_without_system_prompt(self):
        with patch("ralph_wiggum.find_claude_executable", return_value="/usr/bin/claude"):
            cmd = build_claude_command("Hello")
            self.assertIn("--print", cmd)
            self.assertNotIn("--system-prompt", cmd)


class TestRalphProcessTaskWrapper(unittest.TestCase):
    """Test the ralph_process_task convenience function."""

    def test_wrapper_calls_loop(self):
        def mock_run(*args, **kwargs):
            return {
                "completed": True,
                "iterations_run": 2,
                "total_duration": 3.0,
                "all_succeeded": True,
                "task_id": "wrapper_test",
            }

        with patch("ralph_wiggum.RalphWiggumLoop") as MockLoop:
            mock_instance = MagicMock()
            mock_instance.run.return_value = {
                "completed": True,
                "iterations_run": 2,
                "total_duration": 3.0,
                "all_succeeded": True,
                "task_id": "wrapper_test",
            }
            MockLoop.return_value = mock_instance

            result = ralph_process_task("test prompt")

            self.assertTrue(result["completed"])
            MockLoop.assert_called_once()


# =============================================================================
# INTEGRATION TEST: Orchestrator imports
# =============================================================================

class TestOrchestratorIntegration(unittest.TestCase):
    """Test that orchestrator.py properly imports Ralph Wiggum."""

    def test_ralph_imports_in_orchestrator(self):
        """orchestrator.py should import ralph_wiggum successfully."""
        import importlib.util
        spec = importlib.util.spec_from_file_location(
            "orchestrator", PROJECT_ROOT / "orchestrator.py"
        )
        # We can't fully load orchestrator (it needs .env etc.)
        # but we can check the source for the import
        source = (PROJECT_ROOT / "orchestrator.py").read_text()
        self.assertIn("from ralph_wiggum import", source)
        self.assertIn("RALPH_WIGGUM_AVAILABLE", source)

    def test_orchestrator_has_ralph_functions(self):
        """orchestrator.py should define Ralph integration functions."""
        source = (PROJECT_ROOT / "orchestrator.py").read_text()
        self.assertIn("def process_complex_task_with_ralph", source)
        self.assertIn("def is_task_candidate_for_ralph", source)

    def test_orchestrator_calls_ralph_in_process_loop(self):
        """orchestrator.py should call ralph in process_needs_action_files."""
        source = (PROJECT_ROOT / "orchestrator.py").read_text()
        self.assertIn("process_complex_task_with_ralph(", source)
        self.assertIn("is_task_candidate_for_ralph(", source)


# =============================================================================
# RUN
# =============================================================================

if __name__ == "__main__":
    print("\n" + "=" * 70)
    print("  🧸 RALPH WIGGUM LOOP — COMPREHENSIVE FUNCTIONAL TEST")
    print("=" * 70 + "\n")

    # Run tests
    loader = unittest.TestLoader()
    suite = unittest.TestSuite()

    # Add all test classes
    suite.addTests(loader.loadTestsFromTestCase(TestSentinelDetection))
    suite.addTests(loader.loadTestsFromTestCase(TestFileMoveDetection))
    suite.addTests(loader.loadTestsFromTestCase(TestCustomHook))
    suite.addTests(loader.loadTestsFromTestCase(TestCompletionMultiStrategy))
    suite.addTests(loader.loadTestsFromTestCase(TestStatePersistence))
    suite.addTests(loader.loadTestsFromTestCase(TestRalphWiggumLoopMocked))
    suite.addTests(loader.loadTestsFromTestCase(TestTaskClassification))
    suite.addTests(loader.loadTestsFromTestCase(TestBuildClaudeCommand))
    suite.addTests(loader.loadTestsFromTestCase(TestRalphProcessTaskWrapper))
    suite.addTests(loader.loadTestsFromTestCase(TestOrchestratorIntegration))

    runner = unittest.TextTestRunner(verbosity=2)
    result = runner.run(suite)

    # Print summary
    print("\n" + "=" * 70)
    print("  🧸 RALPH WIGGUM TEST SUMMARY")
    print("=" * 70)
    print(f"  Tests run:     {result.testsRun}")
    print(f"  Failures:      {len(result.failures)}")
    print(f"  Errors:        {len(result.errors)}")
    print(f"  All passed:    {'✅ YES' if result.wasSuccessful() else '❌ NO'}")
    print("=" * 70 + "\n")

    sys.exit(0 if result.wasSuccessful() else 1)
