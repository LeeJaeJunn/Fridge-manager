const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');

const config = getDefaultConfig(__dirname);

// global.css 가 src/ 안에 있으므로 input 경로를 맞춰준다
module.exports = withNativeWind(config, { input: './src/global.css' });
