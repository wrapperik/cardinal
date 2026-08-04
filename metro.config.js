// Teaches Metro to compile .svg files into react-native-svg components rather
// than treating them as opaque image assets. Without this an imported .svg
// resolves to a bare asset reference that nothing on native reliably renders.
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

config.transformer.babelTransformerPath = require.resolve(
  'react-native-svg-transformer/expo',
);
config.resolver.assetExts = config.resolver.assetExts.filter((ext) => ext !== 'svg');
config.resolver.sourceExts = [...config.resolver.sourceExts, 'svg'];

module.exports = config;
