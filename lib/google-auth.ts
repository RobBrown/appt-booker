import "@/lib/validate-env";
import { google } from "googleapis";

export function getGoogleAuth() {
  const auth = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET
  );
  auth.setCredentials({
    refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
  });
  return auth;
}

export function getCalendarClient() {
  return google.calendar({ version: "v3", auth: getGoogleAuth() });
}
