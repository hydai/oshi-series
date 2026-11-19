import { createRouter, createWebHistory } from 'vue-router'

// meta.mode 決定頁面是哪個功能：
//   last   = 你推多久沒開台了（距離上次開台過了多久）
//   recent = 你推最近開了多久（最近 30 天直播總時數）
const routes = [
  { path: '/', name: 'HomeLast', component: () => import('../views/Home.vue'), meta: { mode: 'last' } },
  { path: '/recent', name: 'HomeRecent', component: () => import('../views/Home.vue'), meta: { mode: 'recent' } },
  { path: '/last/:channelId', name: 'LastLive', component: () => import('../views/LastLive.vue'), meta: { mode: 'last' } },
  { path: '/recent/:channelId', name: 'RecentLive', component: () => import('../views/RecentLive.vue'), meta: { mode: 'recent' } },
  // 其他不存在的網址都回首頁
  { path: '/:pathMatch(.*)*', redirect: '/' },
]

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
})

// 依照功能切換瀏覽器分頁上的標題
router.afterEach((to) => {
  document.title = to.meta.mode === 'recent' ? '你推最近開了多久？' : '你推多久沒開台了？'
})

export default router
