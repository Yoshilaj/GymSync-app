import asyncio, json
import numpy as np
import sounddevice as sd
import websockets
TOKEN = "eyJhbGciOiJFUzI1NiIsImtpZCI6IjNkMmIwZTM2LTRiZmUtNDM0YS1hYTFkLWIyMWViM2EwMTY5YSIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJodHRwczovL21hamxyZmJpcHp3cmJ2dWR3bW9qLnN1cGFiYXNlLmNvL2F1dGgvdjEiLCJzdWIiOiI4MjZhN2VmMi02MjE3LTRjMDYtOGM3NC0wOGMyODcyYThiMmEiLCJhdWQiOiJhdXRoZW50aWNhdGVkIiwiZXhwIjoxNzc3Mzc0OTY0LCJpYXQiOjE3NzczNzEzNjQsImVtYWlsIjoieW9zaGluaXNoaWNhbkBnbWFpbC5jb20iLCJwaG9uZSI6IiIsImFwcF9tZXRhZGF0YSI6eyJwcm92aWRlciI6ImVtYWlsIiwicHJvdmlkZXJzIjpbImVtYWlsIl19LCJ1c2VyX21ldGFkYXRhIjp7ImVtYWlsX3ZlcmlmaWVkIjp0cnVlfSwicm9sZSI6ImF1dGhlbnRpY2F0ZWQiLCJhYWwiOiJhYWwxIiwiYW1yIjpbeyJtZXRob2QiOiJwYXNzd29yZCIsInRpbWVzdGFtcCI6MTc3NzM3MTM2NH1dLCJzZXNzaW9uX2lkIjoiYzQ3MjJlYzctYTY5Yy00NGI0LWI5Y2ItNmU0MDI5YWQ3NzA4IiwiaXNfYW5vbnltb3VzIjpmYWxzZX0.qPAHupb32WEYG1gWdPj5Tyjqw7lcuve5qHs--0xZwPkznBlEBY97gW3m6tTdd4Yrl228mjLKwJef6X5NERzk4g"
USER_ID = "826a7ef2-6217-4c06-8c74-08c2872a8b2a"  # the 'sub' field from your JWT
SAMPLE_RATE    = 16000
CHUNK_FRAMES   = 1600   # 100 ms of audio per chunk

async def test_voice():
    url = f"ws://localhost:8000/ws/voice/{USER_ID}?token={TOKEN}"
    async with websockets.connect(url) as ws:
        await ws.send(json.dumps({"type": "session_start", "session_id": None, "voice": True}))
        print(json.loads(await ws.recv()))

        audio_q: asyncio.Queue = asyncio.Queue()
        loop = asyncio.get_event_loop()

        def mic_callback(indata, frames, time, status):
            pcm = (indata[:, 0] * 32767).astype(np.int16).tobytes()
            loop.call_soon_threadsafe(audio_q.put_nowait, pcm)

        print("🎤  Speak now — say something to your coach (Ctrl+C to stop)…")
        print("    keys+Enter: [u]tterance_end  [b]arge_in  [t]imer_done")
        with sd.InputStream(samplerate=SAMPLE_RATE, channels=1, dtype="float32",
                            blocksize=CHUNK_FRAMES, callback=mic_callback):
            async def send_audio():
                while True:
                    await ws.send(await audio_q.get())

            async def send_commands():
                # Simulates the mobile client's control messages without the app:
                # u = VAD gate closed (force Deepgram finalize), b = user spoke
                # over the coach, t = rest timer hit zero.
                keys = {"u": "utterance_end", "b": "barge_in", "t": "timer_done"}
                while True:
                    line = (await asyncio.to_thread(input)).strip().lower()
                    if line in keys:
                        await ws.send(json.dumps({"type": keys[line]}))
                        print(f"→ sent {keys[line]}")

            send_task = asyncio.create_task(send_audio())
            cmd_task = asyncio.create_task(send_commands())
            try:
                while True:
                    msg = await ws.recv()
                    if isinstance(msg, bytes):
                        print(f"[AUDIO] received {len(msg)} bytes of MP3")
                    else:
                        data = json.loads(msg)
                        print(data)
            except (KeyboardInterrupt, Exception):
                send_task.cancel()
                cmd_task.cancel()

asyncio.run(test_voice())