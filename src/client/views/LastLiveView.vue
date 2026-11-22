<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue";
import { parseAccount } from "../../shared/accounts";
import type { LastLive } from "../../shared/api";
import { type FailedLookup, fetchLastLive } from "../api";
import CounterDisplay from "../components/CounterDisplay.vue";
import FailureNotice from "../components/FailureNotice.vue";
import LinkList from "../components/LinkList.vue";
import { elapsedSince, pad2, shortUrl } from "../format";
import { donationLinks, followLink, siteLink } from "../links";
import { MODES } from "../modes";
import { PLATFORMS } from "../platforms";
import type { CounterPart, LinkItem } from "../types";

const props = defineProps<{ account: string }>();

// Twitch logins are case-insensitive; links and lookups use the lowercase form.
const account = parseAccount(props.account)?.id ?? props.account;
const result = ref<LastLive | null>(null);
const failure = ref<FailedLookup | null>(null);
const now = ref(Date.now());
let ticker: ReturnType<typeof setInterval> | undefined;
// The answer can arrive after the visitor has moved on; it must not touch the page then.
let mounted = true;

onMounted(async () => {
  if (!parseAccount(props.account)) {
    failure.value = { error: "invalid_account" };
    return;
  }
  const res = await fetchLastLive(account);
  if (!mounted) return;
  if (!res.ok) {
    failure.value = res;
    return;
  }
  result.value = res.data;
  document.title = `${res.data.channel.name}｜${MODES.last.title}`;
  if (res.data.status === "ended") {
    now.value = Date.now();
    ticker = setInterval(() => (now.value = Date.now()), 1000);
  }
});

onUnmounted(() => {
  mounted = false;
  clearInterval(ticker);
});

const platformLabel = computed(() => (result.value ? PLATFORMS[result.value.platform].label : ""));

const counter = computed<CounterPart[][]>(() => {
  if (result.value?.status !== "ended") return [];
  const { days, hours, minutes, seconds } = elapsedSince(result.value.stream.endedAt, now.value);
  return [
    [
      { value: String(days), unit: "天" },
      { value: pad2(hours), unit: "時" },
    ],
    [
      { value: pad2(minutes), unit: "分" },
      { value: pad2(seconds), unit: "秒" },
    ],
  ];
});

const links = computed<LinkItem[]>(() => {
  const r = result.value;
  if (!r) return [];
  const follow = followLink(r.platform, account, r.channel);
  const donations = donationLinks(r.donations);
  if (r.status === "live") {
    return [{ label: "前往直播", text: shortUrl(r.stream.url), href: r.stream.url }, follow, ...donations];
  }
  if (r.status === "ended") {
    return [follow, { label: "上一場直播", text: shortUrl(r.stream.url), href: r.stream.url }, ...donations];
  }
  return [follow, ...donations];
});

const shortcuts = computed(() =>
  failure.value
    ? [siteLink("查詢其他頻道", MODES.last.home)]
    : [siteLink(MODES.recent.title, `/recent/${account}`), siteLink("查詢其他頻道", MODES.last.home)],
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

    <template v-else-if="result.status === 'ended'">
      <h1 class="lead">距離 <strong>{{ result.channel.name }}</strong> 上次在 {{ platformLabel }} 開台已經過了</h1>
      <CounterDisplay
        :groups="counter"
        ticking
      />
    </template>

    <template v-else-if="result.status === 'live'">
      <h1 class="lead"><strong>{{ result.channel.name }}</strong> 正在 {{ platformLabel }} 直播中</h1>
      <a
        v-if="result.stream.thumbnail"
        class="thumbnail"
        :href="result.stream.url"
        target="_blank"
        rel="noopener noreferrer"
      ><img
        :src="result.stream.thumbnail"
        alt="直播畫面"
        width="640"
        height="360"
      ></a>
      <p
        v-if="result.stream.viewers !== null"
        class="note"
      >{{ result.stream.viewers.toLocaleString("en-US") }} 人正在觀看</p>
    </template>

    <h1
      v-else
      class="lead"
    ><strong>{{ result.channel.name }}</strong> 目前沒有直播紀錄</h1>

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
