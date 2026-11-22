import { flushPromises, mount } from "@vue/test-utils";
import { vi } from "vitest";
import { createMemoryHistory } from "vue-router";
import App from "../../src/client/App.vue";
import { createAppRouter } from "../../src/client/router";

export type FakeApi = Record<string, { status: number; body: unknown }>;

export const jsonResponse = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

/**
 * Mounts the whole app at `path`, with the network replaced by `api`: either
 * a map from decoded request path ("/api/last/@NASA") to the reply, where
 * paths missing from the map fail like a dropped connection, or a function
 * that answers each decoded path itself.
 */
export async function renderAt(path: string, api: FakeApi | ((path: string) => Promise<Response>) = {}) {
  const requested: string[] = [];
  vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
    const pathname = decodeURIComponent(new URL(String(input), "https://liveinfo.oshi.tw").pathname);
    requested.push(pathname);
    if (typeof api === "function") return api(pathname);
    const reply = api[pathname];
    if (!reply) throw new TypeError("Failed to fetch");
    return jsonResponse(reply.status, reply.body);
  });

  const router = createAppRouter(createMemoryHistory());
  await router.push(path);
  await router.isReady();
  const wrapper = mount(App, { global: { plugins: [router] }, attachTo: document.body });
  await flushPromises();
  return { wrapper, router, requested };
}
