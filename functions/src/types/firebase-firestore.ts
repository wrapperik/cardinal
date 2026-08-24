/**
 * The shared upload parser only refers to this client SDK type. Keeping this
 * compile-time stand-in in the Functions project prevents the server build
 * from taking a runtime dependency on the Expo application's Firebase SDK.
 */
export interface Timestamp {
  toMillis(): number;
}
