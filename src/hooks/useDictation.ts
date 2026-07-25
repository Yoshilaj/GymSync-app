import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
} from 'expo-speech-recognition';

export type DictationState = 'idle' | 'starting' | 'listening';

interface Args {
  /** Live interim transcript while the user is speaking. */
  onPartial: (text: string) => void;
  /** Committed transcript for the utterance (also fires via onPartial first). */
  onFinal: (text: string) => void;
  /** Mic or speech-recognition permission refused — surface a settings CTA. */
  onDenied?: () => void;
}

/**
 * Tap-to-talk dictation on top of the platform speech recognizer
 * (expo-speech-recognition). One short utterance per start(): the recognizer
 * auto-stops on silence, and nothing is ever auto-sent — the transcript just
 * fills the input for review.
 */
export function useDictation({ onPartial, onFinal, onDenied }: Args) {
  const [state, setState] = useState<DictationState>('idle');

  // Keep callbacks in refs so the module event subscriptions stay stable.
  const onPartialRef = useRef(onPartial);
  const onFinalRef = useRef(onFinal);
  const onDeniedRef = useRef(onDenied);
  onPartialRef.current = onPartial;
  onFinalRef.current = onFinal;
  onDeniedRef.current = onDenied;

  const stateRef = useRef(state);
  stateRef.current = state;

  useSpeechRecognitionEvent('start', () => setState('listening'));
  useSpeechRecognitionEvent('end', () => setState('idle'));
  useSpeechRecognitionEvent('result', (event) => {
    const transcript = event.results[0]?.transcript ?? '';
    if (!transcript) return;
    if (event.isFinal) {
      onFinalRef.current(transcript);
    } else {
      onPartialRef.current(transcript);
    }
  });
  useSpeechRecognitionEvent('error', (event) => {
    setState('idle');
    // "no-speech" just means silence — return to idle without ceremony.
    if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
      onDeniedRef.current?.();
    }
  });

  const start = useCallback(async () => {
    if (stateRef.current !== 'idle') return;
    setState('starting');
    try {
      const perms = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
      if (!perms.granted) {
        setState('idle');
        onDeniedRef.current?.();
        return;
      }
      ExpoSpeechRecognitionModule.start({
        lang: 'en-US',
        interimResults: true,
        continuous: false,
        addsPunctuation: true,
      });
    } catch {
      setState('idle');
    }
  }, []);

  const stop = useCallback(() => {
    if (stateRef.current === 'idle') return;
    ExpoSpeechRecognitionModule.stop();
  }, []);

  const toggle = useCallback(() => {
    if (stateRef.current === 'idle') {
      void start();
    } else {
      stop();
    }
  }, [start, stop]);

  // Never leave the recognizer running past the owning screen.
  useEffect(() => {
    return () => {
      if (stateRef.current !== 'idle') {
        ExpoSpeechRecognitionModule.stop();
      }
    };
  }, []);

  return { state, start, stop, toggle };
}
