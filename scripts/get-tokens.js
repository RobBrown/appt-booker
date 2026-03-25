/**
 * One-time OAuth2 token capture script.
 * Run this locally to obtain your GOOGLE_REFRESH_TOKEN.
 *
 * Prerequisites:
 *   1. Create a Google Cloud project and enable Calendar API + Gmail API
 *   2. Create OAuth2 credentials (Web Application type)
 *   3. Add http://localhost:3001/oauth2callback as an authorised redirect URI
 *   4. IMPORTANT: Publish the OAuth app to Production status to prevent
 *      the refresh token from expiring after 7 days
 *
 * Usage:
 *   GOOGLE_CLIENT_ID=your_id GOOGLE_CLIENT_SECRET=your_secret node scripts/get-tokens.js
 *
 * This script starts a temporary local server on port 3001 to capture the
 * OAuth2 callback. After running, copy GOOGLE_REFRESH_TOKEN into .env.local
 * and into Render.com environment variables.
 *
 * SECURITY: Never commit credentials or tokens to the repository.
 */

const { google } = require("googleapis");
const { createServer } = require("http");
const { URL } = require("url");

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const REDIRECT_URI = "http://localhost:3001/oauth2callback";

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error(
    "\nError: Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET environment variables before running.\n"
  );
  process.exit(1);
}

const oauth2Client = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);

const SCOPES = [
  "https://www.googleapis.com/auth/calendar",
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/meetings.space.created",
];

const authUrl = oauth2Client.generateAuthUrl({
  access_type: "offline",
  scope: SCOPES,
  prompt: "consent", // force re-consent to always get a refresh token
});

console.log("\n========================================");
console.log("Google OAuth2 Token Capture");
console.log("========================================\n");
console.log("1. Open this URL in your browser:\n");
console.log(authUrl);
console.log("\n2. Sign in as the host account and complete the consent flow.");
console.log("3. You will be redirected — this script will capture the token.\n");

const server = createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost:3001");

  if (url.pathname !== "/oauth2callback") {
    res.writeHead(404);
    res.end("Not found");
    return;
  }

  const code = url.searchParams.get("code");
  if (!code) {
    res.writeHead(400);
    res.end("No authorization code found in callback URL.");
    return;
  }

  try {
    const { tokens } = await oauth2Client.getToken(code);

    res.writeHead(200, { "Content-Type": "text/html" });
    res.end("<h1>Success! Check your terminal for the refresh token.</h1>");

    console.log("\n========================================");
    console.log("Tokens obtained successfully!");
    console.log("========================================\n");
    console.log("Add the following to your .env.local:\n");
    console.log(`GOOGLE_REFRESH_TOKEN=${tokens.refresh_token}`);
    console.log(
      "\nAlso set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env.local and Render.com.\n"
    );
    console.log("IMPORTANT: Keep these values secret. Never commit them to git.\n");

    server.close();
  } catch (err) {
    res.writeHead(500, { "Content-Type": "text/plain" });
    res.end("Error exchanging code for tokens: " + err.message);
    console.error("\nError exchanging code:", err.message);
    server.close();
  }
});

server.listen(3001, () => {
  console.log("Waiting for OAuth2 callback on http://localhost:3001 ...\n");
});
