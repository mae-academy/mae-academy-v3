import PrivacyPolicy from "./PrivacyPolicy";

/**
 * Public static page route for /privacy
 * Fulfills Meta App Review requirements for Instagram comment-to-DM automation.
 * Direct anchor #data-deletion is embedded for Meta User Data Deletion callback.
 */
export default function Privacy() {
  return <PrivacyPolicy />;
}
