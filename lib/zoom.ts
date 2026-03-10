async function getZoomAccessToken(): Promise<string> {
  const credentials = Buffer.from(
    `${process.env.ZOOM_CLIENT_ID}:${process.env.ZOOM_CLIENT_SECRET}`
  ).toString("base64");

  const res = await fetch(
    `https://zoom.us/oauth/token?grant_type=account_credentials&account_id=${process.env.ZOOM_ACCOUNT_ID}`,
    {
      method: "POST",
      headers: { Authorization: `Basic ${credentials}` },
    }
  );

  if (!res.ok) throw new Error(`Zoom token error: ${res.status}`);
  const data = await res.json();
  return data.access_token;
}

export function extractZoomMeetingId(url: string): string | null {
  const match = url.match(/\/j\/(\d+)/);
  const id = match?.[1] ?? null;
  return id && /^\d{9,11}$/.test(id) ? id : null;
}

export async function createZoomMeeting(opts: {
  startTime: string;
  duration: number;
  timezone: string;
}): Promise<{ url: string }> {
  const token = await getZoomAccessToken();
  const res = await fetch("https://api.zoom.us/v2/users/me/meetings", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      topic: "Appointment",
      type: 2,
      start_time: opts.startTime,
      duration: opts.duration,
      timezone: opts.timezone,
    }),
  });

  if (!res.ok) throw new Error(`Zoom create error: ${res.status}`);
  const data = await res.json();
  return { url: data.join_url };
}

export async function updateZoomMeeting(
  meetingId: string,
  opts: { startTime: string; duration: number; timezone: string }
): Promise<void> {
  const token = await getZoomAccessToken();
  const res = await fetch(`https://api.zoom.us/v2/meetings/${meetingId}`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      start_time: opts.startTime,
      duration: opts.duration,
      timezone: opts.timezone,
    }),
  });
  if (!res.ok) throw new Error(`Zoom update error: ${res.status}`);
}

export async function deleteZoomMeeting(meetingId: string): Promise<void> {
  const token = await getZoomAccessToken();
  const res = await fetch(`https://api.zoom.us/v2/meetings/${meetingId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  // 404 means meeting already gone — treat as success
  if (!res.ok && res.status !== 404) throw new Error(`Zoom delete error: ${res.status}`);
}
