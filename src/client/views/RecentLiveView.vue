<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue";
import { parseAccount } from "../../shared/accounts";
import type { RecentLive } from "../../shared/api";
import { type Failure, fetchRecentLive } from "../api";
import CounterDisplay from "../components/CounterDisplay.vue";
import FailureNotice from "../components/FailureNotice.vue";
import LinkList from "../components/LinkList.vue";
import { formatDuration, pad2, shortUrl, splitDuration } from "../format";
import { donationLinks, followLink, siteLink } from "../links";
import { MODES } from "../modes";
import { PLATFORMS } from "../platforms";
import type { CounterPart, LinkItem } from "../types";

const props = defineProps<{ account: string }>();

// Twitch logins are case-insensitive; links and lookups use the lowercase form.
const account = parseAccount(props.account)?.id ?? props.account;
const result = ref<RecentLive | null>(null);
const failure = ref<Failure | null>(null);
// The answer can arrive after the visitor has moved on; it must not touch the page then.
let mounted = true;

onMounted(async () => {
  if (!parseAccount(props.account)) {
    failure.value = "invalid_account";
    return;
  }
  const res = await fetchRecentLive(account);
  if (!mounted) return;
  if (!res.ok) {
    failure.value = res.error;
    return;
  }
  result.value = res.data;
  document.title = `${res.data.channel.name}｜${MODES.recent.title}`;
});

onUnmounted(() => {
  mounted = false;
});

const platformLabel = computed(() => (result.value ? PLATFORMS[result.value.platform].label : ""));

const counter = computed<CounterPart[][]>(() => {
  if (!result.value) return [];
  const { hours, minutes, seconds } = splitDuration(result.value.totalSeconds);
  return [
    [{ value: String(hours), unit: "時" }],
    [
      { value: pad2(minutes), unit: "分" },
      { value: pad2(seconds), unit: "秒" },
    ],
  ];
});

const links = computed<LinkItem[]>(() => {
  const r = result.value;
  if (!r) return [];
  const longest: LinkItem[] = r.longest
    ? [{ label: `最長一場 ${formatDuration(r.longest.seconds)}`, text: shortUrl(r.longest.url), href: r.longest.url }]
    : [];
  return [...longest, followLink(r.platform, account, r.channel), ...donationLinks(r.donations)];
});

const shortcuts = computed(() =>
  failure.value
    ? [siteLink("查詢其他頻道", MODES.recent.home)]
    : [siteLink(MODES.last.title, `/last/${account}`), siteLink("查詢其他頻道", MODES.recent.home)],
);
</script>

<template>
  <main class="page">
    <FailureNotice
      v-if="failure"
      :failure="failure"
    />
    <p
      v-else-if="!result"
      class="status"
    >查詢中…</p>

    <template v-else-if="result.count > 0">
      <h1 class="lead">最近 {{ result.days }} 天內 <strong>{{ result.channel.name }}</strong> 在 {{ platformLabel }} 總共直播了</h1>
      <CounterDisplay :groups="counter" />
      <p class="note">共 {{ result.count }} 場</p>
    </template>

    <h1
      v-else
      class="lead"
    >最近 {{ result.days }} 天內 <strong>{{ result.channel.name }}</strong> 在 {{ platformLabel }} 沒有直播</h1>

    <LinkList
      v-if="links.length > 0"
      :items="links"
    />
    <LinkList
      v-if="result || failure"
      class="shortcuts"
      :items="shortcuts"
    />
  </main>
</template>
