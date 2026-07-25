// Metro config — needed so the Silero VAD model (.onnx) bundles as an asset.
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
config.resolver.assetExts.push('onnx');

module.exports = config;
