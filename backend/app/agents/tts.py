"""
TTS provider layer: text snippet → streamed MP3 bytes.

The active provider is chosen by settings.tts_provider, with an optional
settings.tts_fallback_provider tried when the primary fails (e.g. ElevenLabs
402 when credits run out). Both providers emit MP3, so the client playback
path is identical regardless of which one produced the audio.

Voice selection is per-provider: each personality preset carries a voice for
every provider (see personalities.get_voice).
"""
import logging
from collections.abc import AsyncGenerator

import httpx

from app.agents.personalities import get_voice
from app.config import settings

logger = logging.getLogger(__name__)


class TTSError(Exception):
    """Every configured TTS provider failed for this snippet."""


async def _aura_stream(text: str, voice: str) -> AsyncGenerator[bytes, None]:
    """Stream MP3 audio from Deepgram Aura-2 (same API key as STT)."""
    async with httpx.AsyncClient(timeout=30.0) as http:
        async with http.stream(
            "POST",
            "https://api.deepgram.com/v1/speak",
            params={"model": voice, "encoding": "mp3", "bit_rate": 48000},
            headers={
                "Authorization": f"Token {settings.deepgram_api_key}",
                "Content-Type": "application/json",
            },
            json={"text": text},
        ) as response:
            response.raise_for_status()
            async for chunk in response.aiter_bytes(chunk_size=4096):
                if chunk:
                    yield chunk


async def _elevenlabs_stream(text: str, voice: str) -> AsyncGenerator[bytes, None]:
    """Stream MP3 audio from ElevenLabs Flash for a given text snippet."""
    async with httpx.AsyncClient(timeout=30.0) as http:
        async with http.stream(
            "POST",
            f"https://api.elevenlabs.io/v1/text-to-speech/{voice}/stream",
            headers={
                "xi-api-key": settings.elevenlabs_api_key,
                "Content-Type": "application/json",
            },
            json={
                "text": text,
                "model_id": "eleven_flash_v2_5",
                "voice_settings": {
                    "stability": 0.5,
                    "similarity_boost": 0.75,
                    "use_speaker_boost": True,
                },
                "output_format": "mp3_44100_128",
            },
        ) as response:
            response.raise_for_status()
            async for chunk in response.aiter_bytes(chunk_size=4096):
                if chunk:
                    yield chunk


PROVIDERS = {
    "aura": _aura_stream,
    "elevenlabs": _elevenlabs_stream,
}


def _provider_chain() -> list[str]:
    chain = [settings.tts_provider]
    fallback = settings.tts_fallback_provider
    if fallback and fallback != settings.tts_provider:
        chain.append(fallback)
    return [p for p in chain if p in PROVIDERS]


async def synthesize(text: str, preset_id: str) -> AsyncGenerator[bytes, None]:
    """
    Stream MP3 for `text`, trying each configured provider in order.

    Raises TTSError when no provider produced a complete stream. If a provider
    dies *after* yielding audio, we stop rather than retry — restarting the
    sentence on another provider would send the client duplicated audio. In
    practice providers fail on the response headers (raise_for_status), before
    the first byte.
    """
    last_exc: Exception | None = None
    for provider in _provider_chain():
        voice = get_voice(preset_id, provider)
        yielded = False
        try:
            async for chunk in PROVIDERS[provider](text, voice):
                yielded = True
                yield chunk
            return
        except Exception as exc:
            last_exc = exc
            logger.warning("TTS provider %r failed: %s", provider, exc)
            if yielded:
                break
    raise TTSError(str(last_exc) if last_exc else "no TTS provider configured")
