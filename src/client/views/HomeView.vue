<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import { accountFromInput, type Platform } from "../../shared/accounts";
import { fetchConfig } from "../api";
import LinkList from "../components/LinkList.vue";
import { siteLink } from "../links";
import { type Mode, MODES } from "../modes";
import { PLATFORMS } from "../platforms";

const props = defineProps<{ mode: Mode }>();

const router = useRouter();
const platforms: Platform[] = ["youtube", "twitch"];
const platform = ref<Platform>("youtube");
const twitchEnabled = ref(false);
const input = ref("");
const invalid = ref(false);

const ui = computed(() => PLATFORMS[platform.value]);
const otherMode = computed<Mode>(() => (props.mode === "last" ? "recent" : "last"));
const shortcuts = computed(() => [siteLink(MODES[otherMode.value].title, MODES[otherMode.value].home)]);

onMounted(async () => {
  const config = await fetchConfig();
  twitchEnabled.value = config.ok && config.data.twitch;
});

function choose(next: Platform) {
  platform.value = next;
  invalid.value = false;
}

function fillExample() {
  input.value = ui.value.examples[props.mode];
  invalid.value = false;
}

function submit() {
  const account = accountFromInput(input.value, platform.value);
  if (account === null) {
    invalid.value = true;
    return;
  }
  void router.push({ name: props.mode, params: { account } });
}
</script>

<template>
  <main class="page">
    <h1>{{ MODES[mode].title }}</h1>

    <div
      v-if="twitchEnabled"
      class="platforms"
      role="group"
      aria-label="平台"
    >
      <button
        v-for="p in platforms"
        :key="p"
        type="button"
        :aria-pressed="platform === p"
        @click="choose(p)"
      >{{ PLATFORMS[p].label }}</button>
    </div>

    <form
      class="lookup"
      novalidate
      @submit.prevent="submit"
    >
      <label
        class="visually-hidden"
        for="account"
      >{{ ui.label }} 帳號</label>
      <input
        id="account"
        v-model="input"
        type="text"
        :placeholder="ui.placeholder"
        autocomplete="off"
        autocapitalize="none"
        spellcheck="false"
        enterkeyhint="search"
        :aria-invalid="invalid"
        :aria-describedby="invalid ? 'account-error' : 'account-hint'"
        @input="invalid = false"
      >
      <button
        type="submit"
        class="submit"
      >查詢</button>
    </form>

    <p
      v-if="invalid"
      id="account-error"
      class="warning"
      role="alert"
    >{{ ui.invalid }}</p>
    <p
      v-else
      id="account-hint"
      class="hint"
    >
      {{ ui.hint }}，例如 <button
        type="button"
        class="example"
        @click="fillExample"
      >{{ ui.examples[mode] }}</button>
    </p>

    <LinkList
      class="shortcuts"
      :items="shortcuts"
    />
  </main>
</template>
