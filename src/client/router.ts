import { createRouter, type RouteRecordRaw, type RouterHistory } from "vue-router";
import { MODES } from "./modes";
import HomeView from "./views/HomeView.vue";
import LastLiveView from "./views/LastLiveView.vue";
import RecentLiveView from "./views/RecentLiveView.vue";

declare module "vue-router" {
  interface RouteMeta {
    title?: string;
  }
}

const routes: RouteRecordRaw[] = [
  { path: "/", name: "home-last", component: HomeView, props: { mode: "last" }, meta: { title: MODES.last.title } },
  {
    path: "/recent",
    name: "home-recent",
    component: HomeView,
    props: { mode: "recent" },
    meta: { title: MODES.recent.title },
  },
  { path: "/last/:account", name: "last", component: LastLiveView, props: true, meta: { title: MODES.last.title } },
  {
    path: "/recent/:account",
    name: "recent",
    component: RecentLiveView,
    props: true,
    meta: { title: MODES.recent.title },
  },
  // Anything else, including /last without an account, goes home.
  { path: "/:pathMatch(.*)*", redirect: "/" },
];

export function createAppRouter(history: RouterHistory) {
  const router = createRouter({ history, routes });
  router.afterEach((to) => {
    if (to.meta.title) document.title = to.meta.title;
  });
  return router;
}
