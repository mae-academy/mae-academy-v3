// The outbound-request policy lives beside the other API guards so the Vercel functions under api/ and this
// Express server apply exactly the same rules. Re-exported here for the server modules and their tests.
export * from "../api/_lib/security/ssrf";
