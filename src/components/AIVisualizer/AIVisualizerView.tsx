import { useEffect, useRef } from 'react';
import { AppState, StyleSheet, View } from 'react-native';
import WebView from 'react-native-webview';
import { visualizerHtml } from './visualizerHtml';
import { radius } from '@/theme';

interface Props {
  height?: number;
  /** 0–1 intensity driven by AI TTS output level. Injected into the WebView each render. */
  intensity?: number;
}

export function AIVisualizerView({ height = 180, intensity }: Props) {
  const webviewRef = useRef<WebView>(null);

  useEffect(() => {
    if (intensity !== undefined && webviewRef.current) {
      webviewRef.current.injectJavaScript(`setIntensity(${intensity}); true;`);
    }
  }, [intensity]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (nextState) => {
      if (!webviewRef.current) return;
      if (nextState === 'active') {
        webviewRef.current.injectJavaScript('resumeAnimation(); true;');
      } else {
        // Screen locked or app backgrounded — stop the render loop
        webviewRef.current.injectJavaScript('pauseAnimation(); true;');
      }
    });
    return () => sub.remove();
  }, []);

  return (
    <View style={[styles.container, { height }]}>
      <WebView
        ref={webviewRef}
        source={{ html: visualizerHtml }}
        style={styles.webview}
        scrollEnabled={false}
        bounces={false}
        overScrollMode="never"
        javaScriptEnabled
        originWhitelist={['*']}
        allowsInlineMediaPlayback
        mediaPlaybackRequiresUserAction={false}
        // Transparent background so it blends with the card
        androidLayerType="hardware"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: radius.lg,
    overflow: 'hidden',
    backgroundColor: '#E9F2FD',
  },
  webview: {
    flex: 1,
    backgroundColor: 'transparent',
  },
});
