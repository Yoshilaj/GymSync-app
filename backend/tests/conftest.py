"""
Test bootstrap. Settings has required secret fields, so we inject dummy values into the
environment BEFORE any app module (which triggers config.get_settings()) is imported.
These are never real credentials — the unit tests here never touch the network or DB.
"""
import os

os.environ.setdefault("SUPABASE_URL", "http://localhost")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "test")
os.environ.setdefault("SUPABASE_JWT_SECRET", "test")
os.environ.setdefault("ANTHROPIC_API_KEY", "test")
os.environ.setdefault("DEEPGRAM_API_KEY", "test")
os.environ.setdefault("ELEVENLABS_API_KEY", "test")
