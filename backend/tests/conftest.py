"""
Shared pytest setup.

Async tests run via pytest-asyncio's auto mode, configured in backend/pytest.ini
rather than here — the mode is an ini option and cannot be set from a conftest
hook. This file exists so `from tests.fake_supabase import ...` resolves when
pytest is invoked from backend/.
"""
