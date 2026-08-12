const appJson = require("./app.json");

module.exports = () => {
  const iosUrlScheme = process.env.EXPO_PUBLIC_GOOGLE_IOS_URL_SCHEME;
  const googlePlugin = iosUrlScheme
    ? [["@react-native-google-signin/google-signin", { iosUrlScheme }]]
    : [];

  return {
    ...appJson.expo,
    plugins: [...appJson.expo.plugins, ...googlePlugin],
  };
};
