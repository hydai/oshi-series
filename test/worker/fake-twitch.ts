export interface TwitchUser {
  id: string;
  login: string;
  display_name: string;
  type: string;
  broadcaster_type: string;
  description: string;
  profile_image_url: string;
  offline_image_url: string;
  view_count: number;
  created_at: string;
}

export interface TwitchStream {
  id: string;
  user_id: string;
  user_login: string;
  user_name: string;
  game_id: string;
  game_name: string;
  type: "live";
  title: string;
  tags: string[];
  viewer_count: number;
  started_at: string;
  language: string;
  thumbnail_url: string;
  tag_ids: string[];
  is_mature: boolean;
}

export interface TwitchVideo {
  id: string;
  stream_id: string | null;
  user_id: string;
  user_login: string;
  user_name: string;
  title: string;
  description: string;
  created_at: string;
  published_at: string;
  url: string;
  thumbnail_url: string;
  viewable: string;
  view_count: number;
  language: string;
  type: "archive" | "upload" | "highlight";
  duration: string;
  muted_segments: { duration: number; offset: number }[] | null;
}

export const CLIENT_ID = "test-client-id";
export const CLIENT_SECRET = "test-client-secret";

export interface FakeTwitch {
  fetch: typeof fetch;
  requests: Request[];
  /** App tokens handed out so far. */
  tokensIssued(): number;
  /** Make every token issued so far invalid, as when one expires early. */
  revokeTokens(): void;
  count(path: string): number;
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

/**
 * A stand-in for id.twitch.tv's client-credentials flow and the Helix
 * endpoints this site uses. Helix calls need a live app token and the
 * matching Client-Id, like the real API.
 */
export function fakeTwitch({
  users,
  streams = [],
  videos = [],
}: {
  users: TwitchUser[];
  streams?: TwitchStream[];
  videos?: TwitchVideo[];
}): FakeTwitch {
  const requests: Request[] = [];
  const valid = new Set<string>();
  let issued = 0;

  const handle = async (request: Request): Promise<Response> => {
    const url = new URL(request.url);
    if (url.origin === "https://id.twitch.tv" && url.pathname === "/oauth2/token") {
      const form = await request.formData();
      if (request.method !== "POST" || form.get("grant_type") !== "client_credentials") {
        return json({ status: 400, message: "invalid grant type" }, 400);
      }
      if (form.get("client_id") !== CLIENT_ID) return json({ status: 400, message: "invalid client" }, 400);
      if (form.get("client_secret") !== CLIENT_SECRET) {
        return json({ status: 403, message: "invalid client secret" }, 403);
      }
      const token = `token-${++issued}`;
      valid.add(token);
      return json({ access_token: token, expires_in: 5_011_271, token_type: "bearer" });
    }

    if (url.origin !== "https://api.twitch.tv" || !url.pathname.startsWith("/helix/")) {
      throw new Error(`unexpected request to ${url.origin}${url.pathname}`);
    }
    const token = request.headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
    if (!valid.has(token) || request.headers.get("client-id") !== CLIENT_ID) {
      return json({ error: "Unauthorized", status: 401, message: "Invalid OAuth token" }, 401);
    }
    const params = url.searchParams;
    const first = Number(params.get("first") ?? 20);
    switch (url.pathname) {
      case "/helix/users":
        return json({ data: users.filter((u) => params.getAll("login").includes(u.login)) });
      case "/helix/streams":
        return json({ data: streams.filter((s) => s.user_id === params.get("user_id")), pagination: {} });
      case "/helix/videos": {
        const data = videos
          .filter((v) => v.user_id === params.get("user_id") && v.type === (params.get("type") ?? v.type))
          .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))
          .slice(0, first);
        return json({ data, pagination: {} });
      }
      default:
        return json({ error: "Not Found", status: 404, message: "" }, 404);
    }
  };

  return {
    requests,
    tokensIssued: () => issued,
    revokeTokens: () => valid.clear(),
    count: (path) => requests.filter((r) => new URL(r.url).pathname === path).length,
    fetch: async (input, init) => {
      const request = new Request(input, init);
      requests.push(request.clone());
      return handle(request);
    },
  };
}

// ---- Fixture builders ----

export function twitchUser(login: string, id: string, displayName: string): TwitchUser {
  return {
    id,
    login,
    display_name: displayName,
    type: "",
    broadcaster_type: "affiliate",
    description: "",
    profile_image_url: `https://static-cdn.jtvnw.net/jtv_user_pictures/${login}-profile_image-300x300.png`,
    offline_image_url: "",
    view_count: 0,
    created_at: "2020-01-01T00:00:00Z",
  };
}

export function twitchStream(user: TwitchUser, viewers: number, startedAt: string): TwitchStream {
  return {
    id: `stream-${user.id}`,
    user_id: user.id,
    user_login: user.login,
    user_name: user.display_name,
    game_id: "509658",
    game_name: "Just Chatting",
    type: "live",
    title: "live now",
    tags: ["中文"],
    viewer_count: viewers,
    started_at: startedAt,
    language: "zh",
    thumbnail_url: `https://static-cdn.jtvnw.net/previews-ttv/live_user_${user.login}-{width}x{height}.jpg`,
    tag_ids: [],
    is_mature: false,
  };
}

export function twitchArchive(user: TwitchUser, id: string, createdAt: string, duration: string): TwitchVideo {
  return {
    id,
    stream_id: `s${id}`,
    user_id: user.id,
    user_login: user.login,
    user_name: user.display_name,
    title: `archive ${id}`,
    description: "",
    created_at: createdAt,
    published_at: createdAt,
    url: `https://www.twitch.tv/videos/${id}`,
    thumbnail_url: "",
    viewable: "public",
    view_count: 0,
    language: "zh",
    type: "archive",
    duration,
    muted_segments: null,
  };
}
